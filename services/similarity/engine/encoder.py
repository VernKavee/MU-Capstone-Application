"""The motion encoder, the only part of the trained network the service runs.

A bundle holds the full training checkpoint (BodyPartAutoencoder3f: five motion encoders, body encoders, a view
encoder, decoders). The service only encodes motion, so MotionEncoder builds the five motion encoders exactly as
lib/network.py does and loads their weights ("motion_encoders.*") from that checkpoint, strictly: a missing or
unexpected motion-encoder weight is an error. ConvEncoder, PART_JOINTS / split_body_parts, localize_motion and
normalize_motion are copied from lib/network.py and lib/util/motion.py."""
import copy

import numpy as np
import torch
import torch.nn as nn
import yaml

PARTS = ['torso', 'right_arm', 'left_arm', 'right_leg', 'left_leg']
PART_DIMS = {'torso': 14, 'right_arm': 6, 'left_arm': 6, 'right_leg': 6, 'left_leg': 6}
BODY_PART_MODEL = "BodyPartAutoencoder3f"

# Row indices of each body part in the model's input layout. The model sees the output of localize_motion, which
# removes the pelvis (joint 8) and appends the root velocity as row 14, so every joint after the pelvis moves up one row.
#   "legacy":    original-joint indices applied to that layout (checkpoints trained before the T1 fix).
#   "localized": correct rows. Root velocity goes to the torso (global motion).
PART_JOINTS = {
    "legacy": {'torso': [0, 1, 2, 5, 8, 9, 12], 'right_arm': [2, 3, 4], 'left_arm': [5, 6, 7],
               'right_leg': [9, 10, 11], 'left_leg': [12, 13, 14]},
    "localized": {'torso': [0, 1, 2, 5, 8, 11, 14], 'right_arm': [2, 3, 4], 'left_arm': [5, 6, 7],
                  'right_leg': [8, 9, 10], 'left_leg': [11, 12, 13]},
}


class ModelError(RuntimeError):
    pass


def split_body_parts(motion, layout="legacy"):
    """(Batch, 15, D, T) or (15, D, T) -> {part: rows of that part}."""
    joints = PART_JOINTS[layout]
    if len(motion.shape) == 4:
        return {part: motion[:, idx] for part, idx in joints.items()}
    return {part: motion[idx] for part, idx in joints.items()}


def localize_motion(motion):
    """(15,D,T) -> hip-relative coordinates, the hip's own motion as a velocity row (row 14)."""
    D = motion.shape[1]
    centers = motion[8, :, :]
    motion = motion - centers
    translation = centers[:, 1:] - centers[:, :-1]
    velocity = np.c_[np.zeros((D, 1)), translation]
    velocity = velocity.reshape(1, D, -1)
    return np.r_[motion[:8], motion[9:], velocity]


def normalize_motion(motion, meanpose, stdpose):
    """motion (J,2,T); meanpose / stdpose (J,2), or (J,3) with x, z read as the 2D x, y."""
    if motion.shape[1] == 2 and meanpose.shape[1] == 3:
        meanpose = meanpose[:, [0, 2]]
    if motion.shape[1] == 2 and stdpose.shape[1] == 3:
        stdpose = stdpose[:, [0, 2]]
    return (motion - meanpose[:, :, np.newaxis]) / stdpose[:, :, np.newaxis]


def preprocess(motion2d, meanpose, stdpose):
    """(15,2,T) projected rep -> (30,T) float tensor, the encoder's input."""
    motion2d = localize_motion(motion2d)
    motion2d = normalize_motion(motion2d, meanpose, stdpose)
    motion2d = motion2d.reshape((-1, motion2d.shape[-1]))
    return torch.from_numpy(motion2d).float()


def load_pose_stats(path):
    """meanpose.npy / stdpose.npy -> (J,2) or (J,3) float32 (a 2-column file is widened to x, x, y as in training)."""
    stat = np.load(path)
    if stat.shape[-1] == 2:
        stat = np.stack([stat[:, 0], stat[:, 0], stat[:, 1]], axis=1)
    return stat.astype(np.float32)


class ConvEncoder(nn.Module):

    @classmethod
    def build_from_config(cls, config):
        conv_pool = None if config["conv_pool"] is None else getattr(nn, config["conv_pool"])
        return cls(config["channels"], config["padding"], config["kernel_size"], config["conv_stride"], conv_pool)

    def __init__(self, channels, padding=3, kernel_size=8, conv_stride=2, conv_pool=None):
        super(ConvEncoder, self).__init__()
        self.in_channels = channels[0]
        model = []
        acti = nn.LeakyReLU(0.2)
        for i in range(len(channels) - 1):
            model.append(nn.ReflectionPad1d(padding))
            model.append(nn.Conv1d(channels[i], channels[i+1], kernel_size=kernel_size, stride=conv_stride))
            model.append(acti)
            if conv_pool is not None:
                model.append(conv_pool(kernel_size=2, stride=2))
        self.model = nn.Sequential(*model)

    def forward(self, x):
        x = x[:, :self.in_channels, :]
        return self.model(x)


class MotionEncoder(nn.Module):
    """The five per-part motion encoders of a BodyPartAutoencoder3f, built from its config.yaml "autoencoder"."""

    def __init__(self, ae_config):
        super(MotionEncoder, self).__init__()
        self.part_layout = ae_config.get("part_layout", "legacy")
        if ae_config["motion_encoder"]["cls"] != "ConvEncoder":
            raise ModelError(f"motion encoder {ae_config['motion_encoder']['cls']!r} is not ConvEncoder")
        self.motion_encoders = nn.ModuleDict()
        for part in PARTS:
            m_config = copy.deepcopy(ae_config["motion_encoder"])
            m_config["channels"][0] = PART_DIMS[part]
            self.motion_encoders[part] = ConvEncoder.build_from_config(m_config)

    def encode_motion(self, seqs):
        """(B, 30, T) -> {part: (B, C, T')}."""
        batch_size, channels, seq_len = seqs.size()
        seqs_reshaped = seqs.view(batch_size, channels // 2, 2, seq_len)
        parts_seqs = split_body_parts(seqs_reshaped, self.part_layout)
        codes = {}
        for part in PARTS:
            B, J, D, T = parts_seqs[part].shape
            codes[part] = self.motion_encoders[part](parts_seqs[part].reshape(B, J * D, T))
        return codes


def load_motion_encoder(config_path, checkpoint_path, device):
    """Bundle config.yaml + checkpoint -> MotionEncoder in eval mode. Raises ModelError when the model is not a
    body-part model, or its checkpoint does not hold exactly the motion encoders the config describes."""
    with open(config_path) as f:
        ae = (yaml.safe_load(f) or {}).get("autoencoder") or {}
    if ae.get("cls") != BODY_PART_MODEL:
        raise ModelError(f"the service needs a body-part model with parts {sorted(PARTS)} ({BODY_PART_MODEL}), "
                         f"config.yaml has {ae.get('cls')!r}")
    model = MotionEncoder(ae)
    state = torch.load(checkpoint_path, map_location=device, weights_only=True)
    try:
        model.load_state_dict({k: v for k, v in state.items() if k.startswith("motion_encoders.")}, strict=True)
    except RuntimeError as e:
        raise ModelError(f"checkpoint does not fit the motion encoders in config.yaml: {e}")
    return model.to(device).eval()

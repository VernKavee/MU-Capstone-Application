"""
Model bundles: everything the similarity service needs from one trained model, in one folder, so the model can be
replaced without code changes.

  models/<id>/
    model.json        manifest (below)
    config.yaml       the training config (architecture)
    autoencoder.pt    the checkpoint (state dict)
    meanpose.npy, stdpose.npy   the normalization statistics the model was trained with

model.json (bundle_version 1):
{
  bundle_version : 1
  id, name       : bundle id (= folder name), readable name
  files          : {config, checkpoint, meanpose, stdpose}: file names inside the bundle
  sha256         : {file name: hex digest}   checked when the service loads the bundle
  formula        : { value : "l2" | "spread" | "norm_ratio"   score = cos * exp(-scale * value) * 100
                     scale : number   median L2 / median value over the model's MoCap negative-control pairs
                     scale_source : string }
  source         : { run, iteration, val_total, git_commit }   where the checkpoint came from
  created        : ISO date
}

Which bundle the service uses (first that is set): SimilarityService(model=...) / CLI --model, the environment
variable SIMILARITY_MODEL, service_config.json "model". Each is a bundle id (a folder under service_config.json
"models_dir", relative to this folder) or a path to a bundle folder.

A new bundle is built from a training run by the research repository (scratch/similarity/make_model_bundle.py); this
module only loads and checks one, and switches the active one (activate).
"""
import os
import json
import hashlib

from engine.scoring import VALUES

SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE_VERSION = 1
SERVICE_CONFIG = os.path.join(SERVICE_DIR, "service_config.json")
FILES = {"config": "config.yaml", "checkpoint": "autoencoder.pt", "meanpose": "meanpose.npy", "stdpose": "stdpose.npy"}


class BundleError(RuntimeError):
    pass


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def service_config():
    with open(SERVICE_CONFIG) as f:
        return json.load(f)


def models_dir():
    return os.path.normpath(os.path.join(SERVICE_DIR, service_config()["models_dir"]))


def resolve(model=None):
    """Bundle id or folder (None -> SIMILARITY_MODEL, then service_config.json) -> absolute bundle folder."""
    model = model or os.environ.get("SIMILARITY_MODEL") or service_config()["model"]
    if os.path.isdir(model):
        return os.path.abspath(model)
    return os.path.join(models_dir(), model)


def load_bundle(model=None):
    """-> manifest dict with absolute paths under "paths" and the value function under "value_fn".
    Raises BundleError with what is wrong (missing folder / file, checksum, unknown formula value)."""
    path = resolve(model)
    man_path = os.path.join(path, "model.json")
    if not os.path.exists(man_path):
        raise BundleError(f"no model bundle at {path} (model.json missing); see model_bundle.py")
    with open(man_path) as f:
        man = json.load(f)
    if man.get("bundle_version") != BUNDLE_VERSION:
        raise BundleError(f"{man_path}: bundle_version {man.get('bundle_version')!r}, this service reads {BUNDLE_VERSION}")
    if man["formula"]["value"] not in VALUES:
        raise BundleError(f"{man_path}: unknown formula value {man['formula']['value']!r} (known: {list(VALUES)})")
    paths = {}
    for k, name in man["files"].items():
        p = os.path.join(path, name)
        if not os.path.exists(p):
            raise BundleError(f"bundle {man['id']}: {name} missing")
        if man.get("sha256", {}).get(name) and sha256(p) != man["sha256"][name]:
            raise BundleError(f"bundle {man['id']}: {name} does not match its sha256 in model.json (corrupt or "
                              f"replaced file; rebuild the bundle)")
        paths[k] = p
    man["path"], man["paths"], man["value_fn"] = path, paths, VALUES[man["formula"]["value"]]
    return man


def activate(bundle_id):
    """Make bundle_id the service's model (service_config.json "model")."""
    cfg = service_config()
    cfg["model"] = bundle_id
    with open(SERVICE_CONFIG, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")

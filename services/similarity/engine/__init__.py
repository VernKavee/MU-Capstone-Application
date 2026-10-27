"""The service's scoring core: pose layout and projection (pose.py), the motion encoder (encoder.py), and the DTW
comparison and score formula (scoring.py).

Copied from the research code in scratch/similarity (lib/pose_input.py, lib/network.py, lib/util/motion.py,
evaluate_all.py, evaluate_invariance.py) so that this folder runs on its own. The copies must stay identical in
behaviour: scratch/similarity/tests/check_service_parity.py compares them with the originals."""

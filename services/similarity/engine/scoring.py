"""DTW comparison of two motion-code sequences, and the score formula. From evaluate_all.py."""
import numpy as np


def compute_dtw_cosine_similarity(seq1, seq2):
    """seq1 (C,T1), seq2 (C,T2) motion codes -> (mean cosine, mean L2) along the DTW path (L2 cost)."""
    T1, T2 = seq1.shape[1], seq2.shape[1]

    seq1_norm = seq1 / np.maximum(np.linalg.norm(seq1, axis=0, keepdims=True), 1e-12)
    seq2_norm = seq2 / np.maximum(np.linalg.norm(seq2, axis=0, keepdims=True), 1e-12)
    cos_cost = 1.0 - (seq1_norm.T @ seq2_norm)

    seq1_exp = seq1.T[:, None, :]
    seq2_exp = seq2.T[None, :, :]
    l2_cost = np.sqrt(np.sum((seq1_exp - seq2_exp) ** 2, axis=2))

    # Plain Python lists for the DP fill and backtrack: numpy scalar access inside this sequential loop is slower.
    l2_list = l2_cost.tolist()
    INF = float('inf')
    D = [[INF] * (T2 + 1) for _ in range(T1 + 1)]
    D[0][0] = 0.0
    for i in range(1, T1 + 1):
        Di, Dim1 = D[i], D[i-1]
        row_cost = l2_list[i-1]
        for j in range(1, T2 + 1):
            a, b, c = Dim1[j], Di[j-1], Dim1[j-1]
            Di[j] = row_cost[j-1] + (a if a < b and a < c else (b if b < c else c))

    i, j = T1, T2
    path = []
    while i > 0 and j > 0:
        path.append((i-1, j-1))
        if i == 1: j -= 1
        elif j == 1: i -= 1
        else:
            diag, up, left = D[i-1][j-1], D[i-1][j], D[i][j-1]
            min_choice = 0 if diag <= up and diag <= left else (1 if up <= left else 2)
            if min_choice == 0: i -= 1; j -= 1
            elif min_choice == 1: i -= 1
            else: j -= 1

    return np.mean([1.0 - cos_cost[idx1, idx2] for idx1, idx2 in path]), np.mean([l2_cost[idx1, idx2] for idx1, idx2 in path])


def code_spread(seq1, seq2):
    """L2 between the two code sequences' per-dimension std over time. seq1 (C,T1), seq2 (C,T2); no alignment."""
    return float(np.linalg.norm(np.asarray(seq1).std(1) - np.asarray(seq2).std(1)))


def code_norm_ratio(seq1, seq2):
    """|log(mean_t |a_t| / mean_t |b_t|)|, the overall code-size ratio. seq1 (C,T1), seq2 (C,T2); no alignment."""
    return float(abs(np.log(np.linalg.norm(seq1, axis=0).mean() / np.linalg.norm(seq2, axis=0).mean())))


# formula value name -> f(ref code (C,T1), target code (C,T2), DTW-path mean L2) -> distance (bigger = less similar)
VALUES = {
    "l2": lambda a, b, l2: l2,
    "spread": lambda a, b, l2: code_spread(a, b),
    "norm_ratio": lambda a, b, l2: code_norm_ratio(a, b),
}


def compute_score_scaled(cos, value, scale):
    """The score formula, cos * exp(-s * value) * 100, clipped to 0-100. s puts the value on L2's scale (the bundle's
    formula.scale). The mean cosine is negative when a part moves against the reference (e.g. the resting arm of a
    squat), which would give a score below 0; the output promises 0-100, so such a part scores 0."""
    return float(np.clip(cos * np.exp(-scale * value) * 100, 0.0, 100.0))

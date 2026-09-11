#!/usr/bin/env python3
"""Writes e2e/fixtures/t-pose.y4m: one held T-pose frame, the fake camera the end-to-end
test feeds into getUserMedia (Chrome's --use-file-for-fake-video-capture). Chrome loops a
Y4M file's frames, so a single frame is a static feed, which is all the stub engine's
placement guide and ready gate need: once armed, the stub scripts attempts on a clock.

Source: frame 1568 of ~/Documents/SeniorProject scratch_output/live_webcam/ready_curl_2.mp4
(a real person holding the T pose, from the research repo, reference only per CLAUDE.md).
That frame was picked by scanning the research repo's recordings for one that passes the
stub's own placement and ready-pose checks (lib/engine/stub.ts): the whole body in frame,
not too far away, centred, arms out near shoulder height. Not committed: the repo is
public and this is a photo of a person. Run this once per machine with the research repo's
own Python (it has opencv-python and mediapipe installed; this project does not):

    ~/Documents/SeniorProject/.venv/bin/python e2e/fixtures/generate-tpose.py
"""
import os
import sys
import cv2

SOURCE = os.path.expanduser("~/Documents/SeniorProject/scratch_output/live_webcam/ready_curl_2.mp4")
FRAME = 1568
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "t-pose.y4m")
SIZE = (1280, 720)  # matches the live screen's requested getUserMedia resolution


def main():
    cap = cv2.VideoCapture(SOURCE)
    cap.set(cv2.CAP_PROP_POS_FRAMES, FRAME)
    ok, frame = cap.read()
    if not ok:
        sys.exit(f"could not read frame {FRAME} from {SOURCE}")
    frame = cv2.resize(frame, SIZE)
    yuv = cv2.cvtColor(frame, cv2.COLOR_BGR2YUV_I420)  # I420 planar: exactly a Y4M FRAME's bytes
    with open(OUT, "wb") as f:
        f.write(f"YUV4MPEG2 W{SIZE[0]} H{SIZE[1]} F30:1 Ip A1:1 C420jpeg\n".encode())
        f.write(b"FRAME\n")
        f.write(yuv.tobytes())
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

# e2e/fixtures/t-pose.y4m

Not in git. The workout end-to-end test needs a fake camera feed of a real person holding
a T pose (arms out, whole body visible), because the stub engine's placement guide and
ready gate judge real MediaPipe landmarks before it starts scripting attempts. This repo
is public, so a frame of a real person is not committed.

Generate it once, from the research repo (`~/Documents/SeniorProject`, reference only):

```bash
~/Documents/SeniorProject/.venv/bin/python e2e/fixtures/generate-tpose.py
```

That needs the research repo checked out at the path `generate-tpose.py` names, with its
own `.venv` (it has opencv-python; this project does not and should not). Without the
file, `e2e/workout.spec.ts` skips itself and says why.

The frame carries the research app's own overlay, burned into the recording: its text
readout at the top left and a yellow countdown 3 in the middle. The live stage mirrors the
camera, so that 3 shows mirrored behind this app's countdown in screenshots. It is part of
the picture, not something this app draws.

# Where this folder comes from

Everything here except `server.py`, `requirements.txt` and this file is a copy of
SeniorProject's `src/similarity/` (Punnapat's similarity service), taken at SeniorProject
commit `4b51c3e` (2026-10-27, service 0.11.0, model `bpe_v3_seed2026`). Do not edit the copied
files here: change them in SeniorProject and copy again.

`add_reference.py` is left out: it builds a new built-in reference from a video through
SeniorProject's MediaPipe and rule pipeline, so it runs only there. Copy the new
`references/<exercise>/` folder over afterwards.

To update, from this repository's root, with SeniorProject next to it:

    rm -rf /tmp/similarity && mkdir /tmp/similarity
    git -C ../SeniorProject archive --format=tar HEAD:src/similarity | tar -x -C /tmp/similarity
    rm /tmp/similarity/add_reference.py
    rsync -a --delete --exclude server.py --exclude requirements.txt --exclude SOURCE.md /tmp/similarity/ services/similarity/

then change the commit above, and run the checks in `docs/HANDOVER.md` section 2.

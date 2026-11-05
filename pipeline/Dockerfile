# The annotation pipeline: PDAL, pinned.
#
# PINNED BY DIGEST, and the version is load-bearing rather than cautious.
# `extra_dims` on writers.copc did not exist before PDAL 2.7.0 -- it is absent
# from io/CopcWriter.cpp through 2.6.3. On an older build the option is ignored,
# the height dimension is silently not written, and the pipeline still reports
# success. annotate.py checks the version at startup for the same reason, so
# that a container built from a different base still refuses rather than
# producing a plausible, useless file.
#
# PINNED BY DIGEST, and the three things that forced it were each discovered by
# running the image rather than by reading about it:
#
#   1. `FROM pdal/pdal:2.10.2` -- what this line said for a whole phase -- IS
#      NOT A REAL IMAGE and failed to resolve. PDAL 2.10.2 is a genuine source
#      release (2026-06-12), but Docker Hub's `pdal/pdal` publishes `latest`,
#      content-addressed `sha-*` tags, and semantic tags that stop at 2.9.2
#      (2025-09-01). The published images lag the source releases.
#
#   2. THE SEMANTIC TAGS LIE ABOUT THE VERSION. `pdal/pdal:2.9.2` reports
#      `pdal 2.8.4` when you run it. So a semantic tag here buys neither the
#      version it names nor immutability -- which is the whole reason one would
#      reach for a semantic tag in the first place.
#
#   3. The semantic tags are also AMD64-ONLY; only `latest` carries arm64.
#
# A digest is immutable, resolves per-architecture from one reference, and
# cannot drift the way `latest` can. This index digest currently resolves to
# **pdal 2.10.2**, which is the version this pipeline was designed against.
# require_pdal() still asserts >= 2.7.0 at startup, and that belt-and-braces is
# exactly what caught (2): trust the runtime check, never the tag.
#
# Re-pin with:
#   docker buildx imagetools inspect pdal/pdal:latest | grep Digest
FROM pdal/pdal:latest@sha256:3e38c3feaa100878a285a8dba721dea3995f335f2b70e930382586279e32e064

# Everything the pipeline uses -- readers.copc, writers.copc, filters.outlier,
# filters.smrf, filters.hag_nn, filters.assign -- is a CREATE_STATIC_STAGE in
# libpdal_base, so there are no plugins to build.
#
# TWO CONDA ENVS, AND THE DIFFERENCE MATTERS. `base` (/opt/conda) is bare:
# python 3.14.7 and nothing else. The `pdal` env (/opt/conda/envs/pdal) is the
# real one -- python 3.14.8, numpy 2.5.3, and the `pdal` 3.5.4 Python bindings
# -- and it is what the ENTRYPOINT below selects. A bare `python3` resolves to
# BASE, so it sees no numpy at all; every Python invocation here has to go
# through `conda run -n pdal` or it silently gets the wrong interpreter.
#
# WHAT IS GENUINELY MISSING, for the feature and classifier stages: **scipy**
# (cKDTree, for the multi-scale neighbourhoods) and **scikit-learn** (the
# random forest). Both publish cp314 wheels -- scipy 1.18.1, scikit-learn
# 1.9.1 -- so 3.14 is not an obstacle, but neither is in the image and both
# have to be installed here before anything imports them.
#
# `filters.python` AND `readers.numpy` ARE ABSENT AS PDAL STAGES. Verified
# against `pdal --drivers`, which lists 181 stages and includes neither; they
# need a separately packaged dynamic plugin. This is independent of the conda
# envs above -- the bindings being present does NOT make the stages available,
# and the two are easy to confuse. Nothing here depends on them, and nothing
# should start to without re-checking.
#
# The image sets SHELL to `conda run -n pdal` and defines no ENTRYPOINT, which
# is why every RUN and the ENTRYPOINT below go through conda explicitly.
RUN conda run -n pdal python -m pip install --no-cache-dir \
      "psycopg[binary]==3.2.3" \
      "awscli==1.36.40"

WORKDIR /pipeline
COPY pipeline/thresholds.py pipeline/annotate.py ./
# The bands are read from the repo at runtime, not copied into this directory,
# because src/config/hagBands.json is shared with the TypeScript viewer and
# must stay a single file. thresholds.py resolves it relative to itself.
COPY src/config/hagBands.json ../src/config/hagBands.json

# SCRATCH SPACE IS NOT OPTIONAL. writers.copc cannot write to S3 -- it opens a
# local stream and seeks backwards to patch the header and EVLR offsets once
# the octree is built -- so the derivative is written here and uploaded
# afterwards. Budget roughly twice the output size.
RUN mkdir -p /scratch
ENV TMPDIR=/scratch

# No AWS keys. readers.copc goes through arbiter, which is always compiled in
# and supports IMDSv2, so the EC2 instance profile is enough for both the
# ranged reads and the upload. Credentials in the image would be strictly worse
# and entirely unnecessary.
ENTRYPOINT ["conda", "run", "--no-capture-output", "-n", "pdal", "python", "/pipeline/annotate.py"]

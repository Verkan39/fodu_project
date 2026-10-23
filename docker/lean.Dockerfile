# Development image with the Lean toolchain.
# The project folder `lean/` is mounted at /work, so nothing is installed on the host.

FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

# Run as a normal user, not root. On most Linux machines the first user has
# id 1000, which matches the host user, so files built in /work stay editable.
RUN useradd --create-home --uid 1000 lean
USER lean
ENV PATH="/home/lean/.elan/bin:${PATH}"

# Install exactly the Lean version pinned in lean/lean-toolchain.
COPY --chown=lean lean/lean-toolchain /tmp/lean-toolchain
RUN curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
    | sh -s -- -y --no-modify-path --default-toolchain "$(cat /tmp/lean-toolchain)" \
 && lean --version

WORKDIR /work

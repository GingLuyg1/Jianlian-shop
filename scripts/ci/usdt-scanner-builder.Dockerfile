FROM docker.io/library/rockylinux@sha256:d7be1c094cc5845ee815d4632fe377514ee6ebcf8efaed6892889657e5ddaaa6
RUN dnf -y --setopt=install_weak_deps=False install ca-certificates curl-minimal tar xz gzip git findutils procps-ng glibc-langpack-en python3 iproute which coreutils && dnf clean all
RUN curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz -o /tmp/node.tar.xz \
 && echo 'df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d  /tmp/node.tar.xz' | sha256sum -c - \
 && mkdir /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 \
 && rm /tmp/node.tar.xz
ENV PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8
COPY release-pm2-tools/package.json release-pm2-tools/package-lock.json /opt/jl-ci-tools/
RUN touch /opt/jl-ci-tools/empty-user.conf /opt/jl-ci-tools/empty-global.conf \
 && cd /opt/jl-ci-tools \
 && npm ci --ignore-scripts --no-audit --no-fund --userconfig=/opt/jl-ci-tools/empty-user.conf --globalconfig=/opt/jl-ci-tools/empty-global.conf --registry=https://registry.npmjs.org
ENV PATH=/opt/jl-ci-tools/node_modules/.bin:/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /work/source

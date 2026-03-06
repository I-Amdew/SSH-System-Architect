FROM ubuntu:24.04

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server git nodejs npm sudo \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash codex \
  && mkdir -p /var/run/sshd /home/codex/.ssh /srv \
  && chown -R codex:codex /home/codex/.ssh /srv \
  && echo "codex ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY compose/entrypoint.sh /entrypoint.sh
COPY compose/sshd_config /etc/ssh/sshd_config

RUN chmod +x /entrypoint.sh

EXPOSE 22

CMD ["/entrypoint.sh"]

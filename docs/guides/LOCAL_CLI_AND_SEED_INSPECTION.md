# Local CLI And Legacy Seed Inspection Guide

This guide takes an operator from a fresh local checkout to a complete,
read-only inspection of an existing legacy multiservice seed node. It covers
both repository-local development commands and the linked `knm` executable.

The workflow registers private connection metadata and sanitized node metadata
locally. Inspection does not persist observations and does not change the
remote runtime, node configuration, producer state, wallet state, or chain
state.

## What "New Host" Means

This guide fully supports a host that already runs a compatible legacy
multiservice Koinos node but has not yet been configured in the operator's SSH
client or Node Manager inventory.

A blank server with no Koinos runtime is outside the current inspection MVP.
Node Manager does not yet install Docker, install Koinos services, create a
runtime configuration, open firewall ports, or initialize node data. Provision
and validate the runtime through its owning deployment procedure first, keep it
observer-safe, and then return to this guide.

## 1. Requirements

- macOS, Linux, or another Unix-like operator workstation;
- Node.js 22 or later;
- npm;
- an existing legacy multiservice Koinos node;
- an exact SSH `Host` alias configured on the operator workstation; and
- non-interactive SSH public-key authentication for that alias.

Check the local runtime:

```bash
node --version
npm --version
```

The SSH account must be able to run the fixed inspection probes. The legacy
adapter needs access to Docker metadata, a restricted configuration read, and
the node's loopback JSON-RPC service. Although Node Manager permits only fixed
read-only probes, access to a Docker socket is itself privileged and must be
granted according to the host's security policy.

## 2. Install The Repository Dependencies

From the repository root:

```bash
cd ~/code/koinos-node-manager
npm install
npm run cli -- version
npm run cli -- doctor
```

The separator after `cli` is required. For example:

```bash
npm run cli -- nodes list
```

Do not write `npm run cli --nodes list`; npm will interpret it incorrectly.

Run the complete development gate when validating a checkout or change:

```bash
npm run verify
```

## 3. Choose How To Invoke The CLI

### Repository-local development mode

Use the TypeScript entry point directly through npm:

```bash
npm run cli -- --help
npm run cli -- nodes list
npm run cli -- interactive
```

### Linked local `knm` executable

Build and link the package once:

```bash
npm run build
npm link
```

Then invoke the compiled CLI from any directory:

```bash
knm version
knm doctor
knm nodes list
knm interactive
```

Re-run `npm run build` after source changes when testing the compiled command.
Repository-local `npm run cli -- ...` commands use the current TypeScript
source instead.

## 4. Configure SSH Safely

### Collect trusted access information

Before the first SSH connection, obtain these values through the infrastructure
provider or another trusted channel:

- server hostname or address;
- SSH port;
- initial SSH account;
- initial authentication method; and
- the server's ED25519 host-key fingerprint.

From a trusted server console, the ED25519 fingerprint can be displayed with:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Compare that value with the fingerprint presented by the first workstation
connection. A network-observed key alone does not establish the server's
identity. Stop if the fingerprints do not match.

### Create or select a client key

Reuse a suitable existing key or create a dedicated ED25519 key on the operator
workstation:

```bash
ssh-keygen \
  -t ed25519 \
  -a 64 \
  -f ~/.ssh/koinos-node-manager_ed25519 \
  -C "koinos-node-manager"
```

Protect the private key with a passphrase. Load it into `ssh-agent` before
running non-interactive Node Manager probes:

```bash
ssh-add ~/.ssh/koinos-node-manager_ed25519
```

On macOS, an operator may instead use the supported Keychain integration for
the local OpenSSH installation. Never copy a private key to the server or into
Node Manager storage.

### Authorize the public key

Use the provider console or the host's initial approved login method to create
or select an operator account. Prefer a dedicated account over direct root
login. The account must have only the host access required by the fixed probes.

Install the public key from the operator workstation. The following example
uses a complete documentation-only hostname and user:

```bash
export NEW_SSH_HOST='seed.example.org'
export NEW_SSH_USER='node-operator'
export NEW_SSH_PORT='22'

ssh-copy-id \
  -i ~/.ssh/koinos-node-manager_ed25519.pub \
  -p "$NEW_SSH_PORT" \
  "$NEW_SSH_USER@$NEW_SSH_HOST"
```

The command may prompt for the initial server password. Enter it only in the
local terminal prompt; never put it in a command, shell variable, Node Manager
record, chat message, repository file, or screenshot.

After key authentication works, rotate any password that was disclosed or
temporarily issued. Validate SSH server configuration before reloading it, and
keep a trusted provider-console or second-session recovery path open while
changing authentication policy.

### Define the exact SSH alias

Define an exact alias in `~/.ssh/config`. Use private operational values on the
workstation; do not copy them into repository files, screenshots, or reports.

```sshconfig
Host seed-operator
  HostName seed.example.org
  User node-operator
  Port 22
  IdentityFile ~/.ssh/koinos-node-manager_ed25519
  IdentitiesOnly yes
```

`seed-operator`, `seed.example.org`, and `node-operator` are examples. Replace
them in the private SSH configuration, not in tracked documentation.

Do not type documentation markers such as `<alias>` literally. This guide uses
complete example values or shell variables instead.

Test the exact alias and verify non-interactive authentication before using
Node Manager:

```bash
ssh seed-operator
ssh -o BatchMode=yes seed-operator 'printf "SSH key authentication works\n"'
```

If SSH reports that the host key changed, stop. Compare the current server
fingerprint through a separately trusted console before replacing the local
entry. Never accept an unexpected host key merely to make the command pass.

Node Manager stores only the exact alias. It does not store or display the
resolved hostname, SSH user, password, private-key path, or key material.

### Confirm inspection prerequisites

The current legacy adapter invokes Docker without `sudo`, so the selected
account must already be able to run the fixed Docker inspection operations and
reach the node's loopback JSON-RPC service. Do not grant access casually:
membership in the conventional `docker` group provides root-level control over
the Docker daemon. Use the host's approved security model and treat this as a
known legacy-adapter privilege boundary.

Before registration, confirm that the runtime is already running, is the
expected network and chain, and remains observer-safe unless producer operation
was separately intended and verified. Node Manager inspection will not install
or repair a missing runtime.

## 5. Select The Local Inventory

By default, the CLI uses the platform-specific persistent inventory shown by:

```bash
npm run cli -- paths
```

For an isolated experiment, set `KNM_HOME` before every related command:

```bash
export KNM_HOME="$HOME/.config/koinos-node-manager-lab"
npm run cli -- paths
```

Do not set `KNM_HOME` if the node should remain in the normal operator
inventory. Batch and interactive modes use the same selected inventory.

## 6. Register The SSH Connection

Use stable, non-secret local IDs. Set the exact private SSH alias in a shell
variable so the example command contains no ambiguous placeholder:

```bash
export KNM_CONNECTION_ID='mainnet-seed-connection'
export KNM_SSH_ALIAS='seed-operator'
```

Create the connection reference once:

```bash
npm run cli -- connections add ssh \
  --id "$KNM_CONNECTION_ID" \
  --host-alias "$KNM_SSH_ALIAS"
```

Confirm that the fixed bounded handshake succeeds:

```bash
npm run cli -- connections test "$KNM_CONNECTION_ID"
npm run cli -- connections list
```

If the connection ID already exists, inspect and reuse it instead of adding a
duplicate:

```bash
npm run cli -- connections show "$KNM_CONNECTION_ID"
```

## 7. Register The Existing Seed Node

Set a stable inventory ID:

```bash
export KNM_NODE_ID='mainnet-seed'
```

Add the sanitized inventory record once:

```bash
npm run cli -- nodes add \
  --id "$KNM_NODE_ID" \
  --name "Mainnet Seed" \
  --management connected \
  --origin imported \
  --flavor legacy-microservices \
  --network mainnet \
  --location remote \
  --environment linux \
  --authority observe \
  --connection-ref "connection:$KNM_CONNECTION_ID" \
  --function observer \
  --function seed \
  --function api
```

`nodes add` writes Node Manager inventory metadata only. It does not contact,
configure, restart, adopt, or otherwise change the node. Adding the seed and
API functions does not grant producer or wallet authority.

Review the stored record:

```bash
npm run cli -- nodes show "$KNM_NODE_ID"
npm run cli -- nodes list --function seed
```

## 8. Inspect The Seed

Collect the complete human-readable snapshot:

```bash
npm run cli -- nodes inspect "$KNM_NODE_ID"
```

Inspect individual operator views:

```bash
npm run cli -- nodes inspect "$KNM_NODE_ID" --section overview
npm run cli -- nodes inspect "$KNM_NODE_ID" --section components
npm run cli -- nodes inspect "$KNM_NODE_ID" --section chain
npm run cli -- nodes inspect "$KNM_NODE_ID" --section governance
```

Request the versioned structured contract for automation or GUI integration:

```bash
npm run cli -- nodes inspect "$KNM_NODE_ID" --output json
npm run cli -- nodes inspect "$KNM_NODE_ID" --section components --output json
```

Each fixed probe is bounded. Override the per-probe timeout only within the
documented range of 1,000 to 30,000 milliseconds:

```bash
npm run cli -- nodes inspect "$KNM_NODE_ID" --timeout-ms 30000
```

The result declares `readOnly`, `runtimeChanged`, and `persisted`. Unsupported
facts remain explicitly `unavailable` or `unknown`; they are never inferred
from unrelated evidence.

## 9. Use The Interactive Terminal

Start the prompt from a real TTY:

```bash
npm run cli -- interactive
```

Inside the prompt, omit `npm run cli --` and `knm`:

```text
[inventory:local] knm> nodes list
[inventory:local] knm> connections list
[inventory:local] knm> nodes inspect mainnet-seed
[inventory:local] knm> nodes inspect mainnet-seed --section components
[inventory:local] knm> nodes inspect mainnet-seed --output json
[inventory:local] knm> /help
[inventory:local] knm> /exit
```

The interactive prompt and batch CLI use the same command registry, functional
core, inventory, DTO, errors, and safety policy. The prompt does not interpret
natural language or shell syntax and does not retain an implicit active node.

## 10. Troubleshooting

### npm reports an unknown script or the CLI reports an unknown command

Keep the required separator and resource name:

```bash
npm run cli -- nodes list
```

Use hierarchical help to confirm the exact command:

```bash
npm run cli -- --help
npm run cli -- nodes --help
npm run cli -- nodes inspect --help
```

### `SSH_ALIAS_NOT_CONFIGURED`

The supplied value must be an exact, non-wildcard `Host` entry from the
configured SSH file. A raw hostname or IP address is rejected unless it is
itself an exact `Host` alias.

### `CONNECTION_AUTHENTICATION_FAILED`

Confirm that public-key authentication succeeds with `BatchMode=yes`. Check
the alias's effective user and `IdentityFile`, and verify that the matching
public key is present in the remote account's `authorized_keys`. Node Manager
does not accept or persist passwords.

### SSH host-key verification fails

Treat a changed key as a security event. Verify the server fingerprint through
a trusted console first. Update the local known-host entry only after the
fingerprint matches.

### A connection or node ID already exists

IDs are stable. Inspect and reuse the existing record or deliberately choose a
different ID:

```bash
npm run cli -- connections list
npm run cli -- nodes list
```

### Interactive mode says that no TTY is available

Run `interactive` directly from a local terminal. Scripts and automation must
use explicit batch commands instead.

## 11. Safety Boundary

The current inspection MVP can read only its predefined probe catalog. It does
not accept operator-authored local or remote commands. It cannot install,
configure, start, stop, restart, upgrade, back up, restore, activate a
producer, access a wallet, sign a transaction, or mutate mainnet state.

Public output excludes SSH aliases, resolved hosts, usernames, private endpoint
addresses, producer addresses, peer identities, raw configuration, filesystem
paths, command output, credentials, keys, passwords, and tokens.

Use `doctor` for local integrity checks. Remote connection checks occur only
when requested explicitly:

```bash
npm run cli -- doctor
npm run cli -- doctor --check-connections
```

## 12. Primary Security References

- [Ubuntu OpenSSH server documentation](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
  for key generation, `ssh-copy-id`, permissions, configuration validation,
  and lockout cautions.
- [OpenSSH `ssh_config` manual](https://man.openbsd.org/ssh_config)
  for exact `Host`, `HostName`, `IdentityFile`, and `IdentitiesOnly` semantics.
- [Docker daemon socket protection](https://docs.docker.com/engine/security/protect-access/)
  for the privilege implications and alternatives to direct local socket
  access.

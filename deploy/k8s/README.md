# Running JABR on Kubernetes

Manifests for a single-replica deployment of JABR with persistent storage and a
nightly database backup.

## Before you start: one hard constraint

**JABR is a one-replica application.** It keeps state in a SQLite file and reads
books from a local volume. Two pods sharing that database will corrupt it.

The manifests encode this: `replicas: 1` and `strategy: Recreate`. Do not raise
either. If you need more read capacity, that is a different application.

## 1. Build and push an image

The cluster needs to be able to pull the image. Build it the same way as any
other deployment (`--format docker`, or the `HEALTHCHECK` is dropped):

```sh
podman build --format docker -t ghcr.io/geokkjer/jabr:0.1.0-beta.1 .
podman push ghcr.io/geokkjer/jabr:0.1.0-beta.1
```

Pushing to GHCR needs a token with `write:packages`. For a private registry,
uncomment `imagePullSecrets` in `deployment.yaml` and create the secret:

```sh
kubectl -n jabr create secret docker-registry jabr-registry \
  --docker-server=<registry> --docker-username=<user> --docker-password=<token>
```

## 2. Set your image tag

Edit `kustomization.yaml` (`images.newTag`), or override at apply time:

```sh
kubectl apply -k deploy/k8s
kubectl -n jabr set image deployment/jabr jabr=ghcr.io/geokkjer/jabr:0.1.0-beta.1
```

## 3. Apply

```sh
kubectl apply -k deploy/k8s
kubectl -n jabr rollout status deployment/jabr
```

## 4. Reach it

The Service is `ClusterIP` on port 80, deliberately — JABR has no
authentication. Pick one:

```sh
# Local access
kubectl -n jabr port-forward svc/jabr 8080:80

# Or an Ingress you already trust (LAN-only, VPN, or behind an authenticating
# proxy). Do NOT expose this to the internet: there is no login, and publicly
# serving a copyrighted library is not a good idea.
```

If you use an Ingress on a shared hostname, remember the API is unauthenticated:
anyone who can reach the host can read, upload and reset the library.

## 5. Migrating an existing docker-compose deployment

Copy the `data` and `books` volumes into the PVCs. With the app scaled down:

```sh
kubectl -n jabr scale deployment/jabr --replicas=0

# From the host that ran compose:
podman volume export jabr_data   -o data.tar
podman volume export jabr_books  -o books.tar

# Get them onto the PVCs (a throwaway pod is the simplest path):
kubectl -n jabr run copier --rm -it --restart=Never \
  --image=alpine:3.20 \
  --overrides='{"spec":{"containers":[{"name":"copier","image":"alpine:3.20","command":["sh"],"stdin":true,"tty":true,"volumeMounts":[{"name":"data","mountPath":"/data"},{"name":"books","mountPath":"/books"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"jabr-data"}},{"name":"books","persistentVolumeClaim":{"claimName":"jabr-books"}}]}}'

# then, inside that pod: tar -xf - -C /data < data.tar  (piped in via kubectl exec -i)

kubectl -n jabr scale deployment/jabr --replicas=1
```

Ownership matters: the pod runs as uid/gid 1000, and `fsGroup: 1000` handles
that for you on most CSI drivers. If the app cannot write, check
`chown -R 1000:1000` inside a debug pod.

## 6. Backups

`jabr-backup` runs nightly at 03:00 and keeps 7 copies on the `jabr-backup` PVC.
It uses better-sqlite3's online backup API, so it is safe while the app runs.

This is not a backup strategy by itself — copy the files off-cluster with
whatever you already use (restic, rclone, velero).

To restore: scale the deployment to 0, copy the chosen dump over
`/app/data/jabr.sqlite3` on the data PVC, delete any leftover
`jabr.sqlite3-wal` / `-shm` files, then scale back to 1.

## What these manifests deliberately do not include

- **An Ingress** — depends on your cluster's ingress controller and your
  network stance.
- **A HorizontalPodAutoscaler** — see the constraint at the top.
- **A PodDisruptionBudget** — with one replica, `minAvailable: 1` would just
  block node drains.
- **Helm** — one deployment does not need a templating layer. Fork and edit, or
  kustomize overlay it.

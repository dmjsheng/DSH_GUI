# DSH GUI

Windows desktop wrapper for a local DeepSeek Harness checkout.

## Requirements

- DeepSeek Harness installed at `D:\DSH`
- Node.js and pnpm available on PATH
- `D:\DSH` already built with `pnpm install` and `pnpm run build`

## Run from source

```powershell
pnpm install
pnpm start
```

The app sets `DSH_HOME` to `D:\DSH\.dsh` and opens `http://127.0.0.1:3080`.

## Build

```powershell
pnpm dist
```

The packaged Windows app is written to `dist/`.

## Optional overrides

- `DSH_GUI_HARNESS_ROOT`: Harness checkout path, default `D:\DSH`
- `DSH_GUI_HARNESS_HOME`: Harness data path, default `D:\DSH\.dsh`
- `DSH_GUI_HOST`: bind host, default `127.0.0.1`
- `DSH_GUI_PORT`: bind port, default `3080`
- `DSH_GUI_NODE`: Node.js command, default `D:\Nodejs\node.exe` when present on Windows

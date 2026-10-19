## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/) and listed in
the root `pyproject.toml`. From the repository root:

```bash
uv sync
```

API keys are entered in the app's settings page, not in a `.env` file.

## To run the backend

From the repository root:

```bash
uv run python -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 5000
```

See the root `README.md` for the full developer and one-click setup.

### Backend Structure
util/project.py
```
data/
  {project_id}/
    001/                    # user_image_id
      {user_image}         # User's original image
      reference_images/    # Reference images
        {reference_image}
      style_analysis/      # Analysis results
        001.json          # reference_image_id analysis
      generated_images/           # Generated variations
        000/
          000.png
          prompt.txt
          style_description.json
        ...

```

### Code
- fastapi - ./routes/style.py
- functions - ./core

RUN those command in bash:
```
conda create --name agent python=3.11.8
conda activate agent
cd server
pip install -r requirements.txt
```

## To run the backend (Still implementing linking backend and frontend)
```
python app.py
```

### Old server - mockup payload to frontend
```
fastapi run server.py
```

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

# Style Project

## Setup Dependencies
### Backend
1. Make sure [conda](https://www.anaconda.com/docs/getting-started/miniconda/install) is set up.
2. Set the following environment variables in `backend/.env`:
    - `OPENAI_API_KEY`: Key for accessing OpenAI’s API.
    - `BFL_API_KEY_1`: Primary key for Black Forest Labs FLUX API (text-to-image generation).
    - `BFL_API_KEY_2`: Secondary key for FLUX API (fallback or multi-key usage for image generation).

3. Run the following commands in bash to set up the environment:
    ```bash
    conda create --name agent python=3.11.8
    conda activate agent
    cd backend
    pip install -r requirements.txt
    pip install "autogen-core" "autogen-ext[openai]" "autogen-ext[azure]" "autogen-ext[chromadb]"
    ```


### Frontend
```bash
cd frontend 
npm install
```

## To run the application

**Terminal 1 - Start FastAPI Backend:**
```bash
cd backend
conda activate agent
python app.py
```
- Server started at http://0.0.0.0:5000

**Terminal 2 - Start Next.js Frontend:**
```bash
cd frontend
npm run dev
```
- Application at http://localhost:3000
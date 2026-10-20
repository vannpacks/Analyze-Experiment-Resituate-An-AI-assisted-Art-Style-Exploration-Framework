> [!NOTE]  
> In this branch, is a one-click version of Style-AER. It is for anyone who prefers not to set up Python dependencies manually, and it is just as handy for developers who like using [uv](https://docs.astral.sh/uv/).

# Analyze-Experiment-Resituate (UIST'26) 

### Research Paper: "From Style Replication to Style Exploration: Enabling Art Style Exploration with Analyze-Experiment-Resituate Framework"  
> [Wen-Fan Wang](https://vannwang.com/)¹, [Tsai-Hsuan Lin](https://xup6sophia.github.io/)¹, [Chi-Lan Yang](https://www.chilanyang.space/)², An-Ru Cheng¹, [Bing-Yu Chen](https://www.csie.ntu.edu.tw/~robin/)¹     
> ¹ National Taiwan University
² University of Tsukuba
> 

<p align="left">
  <a href="https://doi.org/10.1145/3830398.3830574">
    <img src="https://img.shields.io/badge/🌐-ACM_DOI-4285F4?style=for-the-badge">
  </a>
  <a href="https://doi.org/10.48550/arXiv.2608.14405">
    <img src="https://img.shields.io/badge/arXiv-2510.15234-b31b1b?style=for-the-badge">
  </a>
</p>

![Analyze-Experiment-Resituate hero image](01_hero_image.png)


## Abstract

Art style is a signature of professional digital artists that develops through repeated experimentation, reflection, and adaptation. While generative AI (GenAI) can reproduce styles with high fidelity, current tools provide limited support for exploring new stylistic directions and may encourage style replication over exploration.

To address this gap, we propose *Analyze-Experiment-Resituate (AER)*, a framework for AI-assisted style exploration derived from interviews with 10 professional digital artists. Rather than prioritizing visually appealing outputs alone, AER supports three core practices of style exploration, including interpreting references, trying out stylistic possibilities, and reflecting on how emerging styles may be received. Specifically, AER enabled artists to (1) analyze artworks into interpretable stylistic elements, (2) have controllable experimentation guided by their own choices, and (3) resituate emerging styles through simulated social perspectives.

We implemented AER in a prototype system and evaluated it in a controlled study with 16 artists. Compared with a direct style-transfer workflow, AER increased artists' agency and reflection as they pursued new stylistic directions. A two-week field study with four artists revealed how the AER framework influenced daily style exploration, such as reflection, experimentation, and stylistic decision-making at each stage. We discuss opportunities and challenges in designing AI-assisted style-exploration workflows, and outline implications for future artistic support tools.

## Obtain and set up the API keys

Style-AER needs two API keys.
- [OpenAI API key](https://platform.openai.com/api-keys)
- [Black Forest Labs (BFL) API key](https://dashboard.bfl.ai/)

On first launch, the setup page asks for the keys. You can change them later with the gear icon in the top-right corner. Leave a field blank to keep its current key.

- Keys are stored only on your computer, in the per-user Style-AER configuration directory. They are not committed to the repository or included in project exports.
- Text and images are sent to OpenAI and Black Forest Labs when you use. You may turn off the training option in your provider account settings.
- If a request fails, check that the key is correct, has not expired, and that your account has available credit.

## Developer mode

Developer mode runs the Next.js development server separately from the FastAPI backend. Node.js is required for the frontend.

### Install dependencies

Install Python 3.11 or newer, Node.js, and [uv](https://docs.astral.sh/uv/).
Then run:

```bash
uv sync
cd frontend
npm install
```

### Start the development servers

**Terminal 1 - FastAPI backend**

```bash
uv run python -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 5000
```

The backend is available at `http://127.0.0.1:5000`.

**Terminal 2 - Next.js frontend**

```bash
cd frontend
npm run dev
```

The development application is available at `http://localhost:3000`.

### Build the production frontend locally

The launcher serves the static frontend from `frontend/out`. Rebuild it after
frontend changes:

```bash
cd frontend
npm run build
cd ..
uv run styleagent
```

The launcher starts FastAPI and the exported frontend on port `8765`, or the next available port, and opens the browser automatically.

## User one-click access

Download `aer-framework.zip` from the GitHub Releases page. It already includes the built frontend, so Node.js and npm are not needed. Downloading the repository source instead requires Node.js; `start.bat` and `start.command` build the frontend automatically on first launch.

### Windows

1. \[Optional\] Install [uv](https://docs.astral.sh/uv/getting-started/installation/), or
   double-click `start.bat` to install it automatically.
2. Double-click `start.bat`.
3. Open the URL printed by the launcher, normally `http://localhost:8765`.

The first launch may download Python and the required packages. This can take several minutes.

### macOS Apple Silicon

1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/), or
   open `start.command` from Terminal.
2. If macOS blocks the script, make it executable:

   ```bash
   chmod +x start.command
   ```

3. Double-click `start.command` and open the URL printed by the launcher.

## License

Code: This project is open source under the MIT License. See [LICENSE](LICENSE) for details.

Paper: The associated research paper is licensed under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND 4.0). Please refer to the paper’s publication page for the full license terms.


## Citation

If you use this project in your research, please cite our UIST'26 paper:

```
@inproceedings{AER2026,
  title={From Style Replication to Style Exploration: Enabling Art Style Exploration with Analyze-Experiment-Resituate Framework},
  booktitle={Proceedings of the 39th Annual ACM Symposium on User Interface Software and Technology},
  year={2026}
}
```

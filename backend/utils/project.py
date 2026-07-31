import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, List, Dict, Any
import os
import shutil
import re
from config import Config

class Project:
    """
    Represents a project with a unique ID and associated data.
    """
    def __init__(self, project_id: Optional[str] = None):
        if project_id is None:
            project_id = str(uuid.uuid4())
        self.project_id: str = project_id
        self.data_path: Path = Config.DATA_DIR / self.project_id
        self.data_path.mkdir(parents=True, exist_ok=True)
    
        self.iteration_id: List[int] = []
        self.user_image_ids: Dict[int, List[int]] = {}  # List of user image IDs
        self.reference_image_ids: Dict[int, List[int]] = {}  # Maps user image ID to a list of reference image IDs
        self.generated_image_ids: Dict[int, List[int]] = {}
        self.current_iteration_id = 0
        self.current_user_image_id = 0
        self.current_reference_image_id = 0
        self.current_generated_image_id = 0
        self._load_state_from_disk()

    @staticmethod
    def _extract_numeric_ids(paths: List[Path], pattern: str) -> List[int]:
        ids: List[int] = []
        for path in paths:
            match = re.match(pattern, path.name)
            if match:
                ids.append(int(match.group(1)))
        return sorted(set(ids))

    def _load_state_from_disk(self) -> None:
        iteration_dirs = [
            p for p in self.data_path.iterdir()
            if p.is_dir() and p.name.isdigit()
        ] if self.data_path.exists() else []

        iteration_ids = sorted(int(p.name) for p in iteration_dirs)
        self.iteration_id = iteration_ids
        self.current_iteration_id = iteration_ids[-1] if iteration_ids else 0

        self.user_image_ids = {}
        self.reference_image_ids = {}
        self.generated_image_ids = {}

        for iteration in iteration_ids:
            iteration_path = self.data_path / f"{iteration:03d}"

            user_images_path = iteration_path / "user_images"
            user_ids = self._extract_numeric_ids(
                [*user_images_path.glob("*.png"), *user_images_path.glob("*.jpg")],
                r"^(\d+)\.(png|jpg)$"
            ) if user_images_path.exists() else []
            self.user_image_ids[iteration] = user_ids

            reference_images_path = iteration_path / "reference_images"
            reference_ids = self._extract_numeric_ids(
                [*reference_images_path.glob("*.png"), *reference_images_path.glob("*.jpg")],
                r"^(\d+)\.(png|jpg)$"
            ) if reference_images_path.exists() else []
            self.reference_image_ids[iteration] = reference_ids

            generated_images_path = iteration_path / "generated_images"
            generated_ids = self._extract_numeric_ids(
                [p for p in generated_images_path.iterdir() if p.is_dir()],
                r"^(\d+)$"
            ) if generated_images_path.exists() else []
            self.generated_image_ids[iteration] = generated_ids

        if self.current_iteration_id:
            current_iteration = self.current_iteration_id
            self.current_user_image_id = max(self.user_image_ids.get(current_iteration, [0])) if self.user_image_ids.get(current_iteration) else 0
            self.current_reference_image_id = max(self.reference_image_ids.get(current_iteration, [0])) if self.reference_image_ids.get(current_iteration) else 0
            self.current_generated_image_id = max(self.generated_image_ids.get(current_iteration, [-1])) if self.generated_image_ids.get(current_iteration) else -1

    def _sync_iteration_ids_from_disk(self) -> None:
        iteration_dirs = [
            p for p in self.data_path.iterdir()
            if p.is_dir() and p.name.isdigit()
        ] if self.data_path.exists() else []
        disk_iteration_ids = sorted(int(p.name) for p in iteration_dirs)

        merged_iteration_ids = sorted(set(self.iteration_id) | set(disk_iteration_ids))
        self.iteration_id = merged_iteration_ids
        self.current_iteration_id = merged_iteration_ids[-1] if merged_iteration_ids else 0

    def get_disk_max_iteration_id(self) -> int:
        iteration_dirs = [
            p for p in self.data_path.iterdir()
            if p.is_dir() and p.name.isdigit()
        ] if self.data_path.exists() else []
        if not iteration_dirs:
            return 0
        return max(int(p.name) for p in iteration_dirs)

    def _sync_generated_ids_from_disk(self, iteration_id: int) -> None:
        generated_images_path = self.data_path / f"{iteration_id:03d}" / "generated_images"
        disk_generated_ids = self._extract_numeric_ids(
            [p for p in generated_images_path.iterdir() if p.is_dir()],
            r"^(\d+)$"
        ) if generated_images_path.exists() else []

        existing_ids = self.generated_image_ids.get(iteration_id, [])
        merged_ids = sorted(set(existing_ids) | set(disk_generated_ids))
        self.generated_image_ids[iteration_id] = merged_ids

        if merged_ids:
            self.current_generated_image_id = max(merged_ids)

    def get_project_path(self) -> Path:
        """
        Returns the path to the project's data directory.
        """
        return self.data_path
    
    def get_current_iteration_id(self) -> int:
        """
        Returns the current iteration ID, which is the length of user image IDs.
        """
        return self.current_iteration_id
    
    def get_generated_images_path(self, iteration_id: int) -> Path:
        """
        Returns the path to the generated images directory for a specific user image.
        """
        return self.data_path / f"{iteration_id:03d}" / "generated_images"

    def add_iteration(self):
        # Re-sync from disk to avoid stale in-memory iteration state
        # when project folders were advanced by another process/session.
        self._sync_iteration_ids_from_disk()
        self.current_iteration_id = (max(self.iteration_id) + 1) if self.iteration_id else 1
        self.iteration_id.append(self.current_iteration_id)
    
    def add_user_image(self, iteration_id: int):
        if iteration_id not in self.user_image_ids:
            self.user_image_ids[iteration_id] = []
        self.current_user_image_id = (max(self.user_image_ids[iteration_id]) + 1) if self.user_image_ids[iteration_id] else 1
        self.user_image_ids[iteration_id].append(self.current_user_image_id)

    def add_reference_image(self, iteration_id: int):
        if iteration_id not in self.reference_image_ids:
            self.reference_image_ids[iteration_id] = []
        self.current_reference_image_id = (max(self.reference_image_ids[iteration_id]) + 1) if self.reference_image_ids[iteration_id] else 1
        self.reference_image_ids[iteration_id].append(self.current_reference_image_id)

    def write_style_analysis(self, iteration_id: int, reference_image_id: int, analysis: Dict[str, Any]):
        """
        Writes the style analysis to a JSON file.
        Args:
            iteration_id (int): The ID of the iteration.
            reference_image_id (int): The ID of the reference image.
            analysis (Dict[str, Any]): The style analysis data.
        """
        import json
        style_analysis_path = self.data_path / f"{iteration_id:03d}" / "style_analysis"
        style_analysis_path.mkdir(parents=True, exist_ok=True)
        analysis_file = style_analysis_path / f"{reference_image_id:03d}.json"
        with open(analysis_file, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=4, ensure_ascii=False)

    def read_style_analysis(self, iteration_id: int, reference_image_id: int) -> Optional[Dict[str, Any]]:
        """
        Reads the style analysis from a JSON file.
        Args:
            iteration_id (int): The ID of the iteration.
            reference_image_id (int): The ID of the reference image.
        Returns:
            Optional[Dict[str, Any]]: The style analysis data if the file exists, otherwise None.
        """
        import json
        analysis_file = self.data_path / f"{iteration_id:03d}" / "style_analysis" / f"{reference_image_id:03d}.json"
        if analysis_file.exists():
            with open(analysis_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None

    def write_content_analysis(self, iteration_id: int, user_image_id:int, analysis: Dict[str, Any]):
        """
        Writes the content analysis to a JSON file.
        Args:
            iteration_id (int): The ID of the iteration.
            user_image_id (int): The ID of the user image.
            analysis (Dict[str, Any]): The content analysis data.
        """
        import json
        content_analysis_path = self.data_path / f"{iteration_id:03d}" / "content_analysis"
        content_analysis_path.mkdir(parents=True, exist_ok=True)
        analysis_file = content_analysis_path / f"{user_image_id:03d}.json"
        with open(analysis_file, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=4, ensure_ascii=False)

    def read_content_analysis(self, iteration_id: int, user_image_id: int) -> Optional[Dict[str, Any]]:
        """
        Reads the content analysis from a JSON file.
        Args:
            iteration_id (int): The ID of the iteration.
            user_image_id (int): The ID of the user image.
        Returns:
            Optional[Dict[str, Any]]: The content analysis data if the file exists, otherwise None.
        """
        import json
        analysis_file = self.data_path / f"{iteration_id:03d}" / "content_analysis" / f"{user_image_id:03d}.json"
        if analysis_file.exists():
            with open(analysis_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None


    def add_generated_image(self, iteration_id: int): 
        """
        Add a generated image and return its 0-based index.
        This should be called BEFORE generating each image to get the correct ID.
        """
        # Re-sync from disk to avoid stale in-memory generated-image state.
        self._sync_generated_ids_from_disk(iteration_id)
        if iteration_id not in self.generated_image_ids:
            self.generated_image_ids[iteration_id] = []
        
        # Use 0-based indexing for generated images (000, 001, 002, etc.)
        self.current_generated_image_id = (max(self.generated_image_ids[iteration_id]) + 1) if self.generated_image_ids[iteration_id] else 0
        self.generated_image_ids[iteration_id].append(self.current_generated_image_id)
        return self.current_generated_image_id

    def read_generated_image(self, iteration_id: int, generated_image_id: int) -> Optional[Path]:
        """
        Reads the generated image by its ID.
        Args:
            iteration_id (int): The ID of the iteration.
            generated_image_id (int): The ID of the generated image (0-based).
        Returns:
            Optional[Path]: The path to the generated image if it exists, otherwise None.
        """
        image_path = self.data_path / f"{iteration_id:03d}" / "generated_images" / f"{generated_image_id:03d}" / f"{generated_image_id:03d}.png"

        # Prefer real filesystem existence over in-memory cache.
        if image_path.exists():
            print(f"Reading generated image from path: {image_path}")
            if iteration_id not in self.generated_image_ids:
                self.generated_image_ids[iteration_id] = []
            if generated_image_id not in self.generated_image_ids[iteration_id]:
                self.generated_image_ids[iteration_id].append(generated_image_id)
                self.generated_image_ids[iteration_id].sort()
            return image_path

        # Fallback: refresh generated id cache for this iteration from disk in case cache is stale.
        generated_images_path = self.data_path / f"{iteration_id:03d}" / "generated_images"
        if generated_images_path.exists():
            disk_generated_ids = self._extract_numeric_ids(
                [p for p in generated_images_path.iterdir() if p.is_dir()],
                r"^(\d+)$"
            )
            self.generated_image_ids[iteration_id] = disk_generated_ids

            if generated_image_id in disk_generated_ids and image_path.exists():
                print(f"Reading generated image from path: {image_path}")
                return image_path

        return None
        
    def read_user_image(self, iteration_id: int, user_image_id: int) -> Optional[Path]:
        """
        Reads the user image by its ID.
        Args:
            iteration_id (int): The ID of the iteration.
            user_image_id (int): The ID of the user image.
        Returns:
            Optional[Path]: The path to the user image if it exists, otherwise None.
        """
        # use os join 
        user_image_folder = os.path.join(self.data_path, f"{iteration_id:03d}", "user_images")
        user_image_files = list(Path(user_image_folder).glob(f"{user_image_id:03d}.png")) + list(Path(user_image_folder).glob(f"{user_image_id:03d}.jpg"))
        print(f"Looking for user image in folder: {user_image_folder}, found files: {user_image_files}")
        if not user_image_files:
            raise FileNotFoundError(f"User image {user_image_id} not found.")
        return str(user_image_files[0])
    
    
    def read_reference_image(self, iteration_id: int, reference_image_id: int) -> Path:
        
        reference_image_folder = os.path.join(self.data_path, f"{iteration_id:03d}", "reference_images")
        reference_image_files = list(Path(reference_image_folder).glob(f"{reference_image_id:03d}.png")) + list(Path(reference_image_folder).glob(f"{reference_image_id:03d}.jpg"))
        if not reference_image_files:
            raise FileNotFoundError(f"Reference image {reference_image_id} for iteration {iteration_id} not found.")
        return str(reference_image_files[0])
    
    
    def write_current_project(self, data: Dict[str, Any]):
        """
        Writes the current project data to a file.
        Args:
            data (Dict[str, Any]): The data to write.
        """
        project_file = self.data_path / "project.json"
        with open(project_file, 'w') as f:
            import json
            json.dump(data, f, indent=4)
            
    
    def copy_to_user_image(self, generated_image_id: int, user_image_id: int, iteration_id: int, source_iteration_id: Optional[int] = None):
        """
        Copies a generated image to the user images folder as a new user image.
        Args:
            generated_image_id (int): The ID of the generated image.
            user_image_id (int): The ID of the new user image.
            iteration_id (int): The target iteration ID where the user image will be saved.
            source_iteration_id (Optional[int]): The source iteration ID to read generated image from.
        """
        source_iteration = source_iteration_id if source_iteration_id is not None else iteration_id
        generated_image_path = self.read_generated_image(source_iteration, generated_image_id)
        if generated_image_path is None:
            raise FileNotFoundError(f"Generated image {generated_image_id} not found in iteration {source_iteration}.")
        
        user_image_folder = self.data_path / f"{iteration_id:03d}" / "user_images"
        user_image_folder.mkdir(parents=True, exist_ok=True)
        user_image_path = user_image_folder / f"{user_image_id:03d}.png"
        shutil.copy(generated_image_path, user_image_path)

    def copy_to_reference_image(self, generated_image_id: int, reference_image_id: int, iteration_id: int, source_iteration_id: Optional[int] = None):
        """
        Copies a generated image to the reference images folder as a new reference image.
        Args:
            generated_image_id (int): The ID of the generated image.
            reference_image_id (int): The ID of the new reference image.
            iteration_id (int): The target iteration ID where the reference image will be saved.
            source_iteration_id (Optional[int]): The source iteration ID to read generated image from.
        """
        source_iteration = source_iteration_id if source_iteration_id is not None else iteration_id
        generated_image_path = self.read_generated_image(source_iteration, generated_image_id)
        if generated_image_path is None:
            raise FileNotFoundError(f"Generated image {generated_image_id} not found in iteration {source_iteration}.")
        
        reference_image_folder = self.data_path / f"{iteration_id:03d}" / "reference_images"
        reference_image_folder.mkdir(parents=True, exist_ok=True)
        reference_image_path = reference_image_folder / f"{reference_image_id:03d}.png"
        shutil.copy(generated_image_path, reference_image_path)
"""
clean_lfw_dataset.py
Applies OpenCV Laplacian variance to filter out blurry LFW images.
"""
import os
import cv2
import pandas as pd

LFW_ROOT = r"C:\Users\sharl\datasets\lfw\lfw-deepfunneled\lfw-deepfunneled"
CSV_DIR = r"C:\Users\sharl\datasets\lfw"
BLUR_THRESHOLD = 100.0 # Adjust based on testing; 100 is standard for OpenCV

def image_path(name: str, imagenum: int) -> str:
    return os.path.join(LFW_ROOT, name, f"{name}_{int(imagenum):04d}.jpg")

def is_blurry(img_path: str) -> bool:
    """Returns True if the image variance falls below the threshold."""
    if not os.path.exists(img_path):
        return True 
    
    # Read in grayscale as outlined in the proposal
    image = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return True
        
    variance = cv2.Laplacian(image, cv2.CV_64F).var()
    return variance < BLUR_THRESHOLD

def filter_csv(filename: str, is_match_file: bool):
    file_path = os.path.join(CSV_DIR, filename)
    df = pd.read_csv(file_path)
    clean_rows = []
    
    print(f"Processing {filename}...")
    for _, row in df.iterrows():
        img1 = image_path(row["name"], row["imagenum1"])
        img2_name = row["name"] if is_match_file else row["name.1"]
        img2 = image_path(img2_name, row["imagenum2"])
        
        # Only keep the pair if BOTH images pass the OpenCV quality gate
        if not is_blurry(img1) and not is_blurry(img2):
            clean_rows.append(row)
            
    clean_df = pd.DataFrame(clean_rows)
    clean_filename = f"clean_{filename}"
    clean_df.to_csv(os.path.join(CSV_DIR, clean_filename), index=False)
    print(f"Saved {len(clean_df)} valid pairs out of {len(df)} to {clean_filename}")

if __name__ == "__main__":
    filter_csv("matchpairsDevTest.csv", is_match_file=True)
    filter_csv("mismatchpairsDevTest.csv", is_match_file=False)
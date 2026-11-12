"""ML microservice: face verification, head-turn liveness and mock IPRS."""
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI


from liveness import router as liveness_router
from ocr import router as ocr_router

from verification import router as verification_router

app = FastAPI(title="Caregiver ML Microservice")


@app.get("/")
def root():
    return {"service": "ml_microservice", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml_microservice"}


app.include_router(verification_router)
app.include_router(liveness_router)
app.include_router(ocr_router)
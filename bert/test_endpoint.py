from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_long_input():
    # 256 tokens max; 300 words is well over limits
    long_text = "thử nghiệm " * 300
    
    # We must use the context manager to trigger lifespan events (load BERTScorer)
    with client:
        print("Sending POST request to /calculate-score with heavy payload...")
        response = client.post("/calculate-score", json={
            "reference_text": long_text,
            "candidate_text": long_text
        })
        
        assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
        data = response.json()
        assert "f1_score" in data, "Response JSON missing f1_score"
        print("Success! F1 Score:", data["f1_score"])

if __name__ == "__main__":
    test_long_input()

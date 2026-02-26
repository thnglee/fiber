from bert_score import BERTScorer

scorer = BERTScorer(model_type="vinai/phobert-base", lang="vi", num_layers=9, device="cpu", rescale_with_baseline=False)
try:
    cands = ["test " * 300]
    refs = ["test " * 300]
    F1 = scorer.score(cands, refs)
    print("Success without truncation", F1)
except Exception as e:
    print("Failed without truncation", type(e), e)

tokenizer = scorer._tokenizer
tokens = tokenizer("test " * 300, max_length=256, truncation=True)
decoded = tokenizer.decode(tokens["input_ids"], skip_special_tokens=True)
print("Decoded length:", len(decoded.split()))
F1 = scorer.score([decoded], [decoded])
print("Success with truncation!", F1)

INSERT INTO model_configurations (
  provider, model_name, display_name, model_type, is_active, temperature,
  context_window, supports_streaming, supports_structured_output, supports_temperature,
  input_cost_per_1m, output_cost_per_1m
) VALUES
  ('huggingface', 'vinai/PhoGPT-4B-Chat',                    'PhoGPT-4B-Chat',       'chat', FALSE, 0.7, 8192,  FALSE, FALSE, TRUE, 0, 0),
  ('huggingface', 'VietAI/vit5-large-vietnews-summarization', 'ViT5-large (VN News)', 'base', FALSE, 0.7, 1024,  FALSE, FALSE, TRUE, 0, 0);

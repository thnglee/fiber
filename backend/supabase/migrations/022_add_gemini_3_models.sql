INSERT INTO model_configurations (
  provider, model_name, display_name, model_type, is_active, temperature,
  context_window, supports_streaming, supports_structured_output, supports_temperature,
  input_cost_per_1m, output_cost_per_1m
) VALUES
  ('gemini', 'gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite', 'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE, 0.075, 0.30),
  ('gemini', 'gemini-flash-latest', 'Gemini Flash Latest', 'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE, 0.15, 0.60),
  ('gemini', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE, 0.15, 0.60)
ON CONFLICT (model_name) DO NOTHING;

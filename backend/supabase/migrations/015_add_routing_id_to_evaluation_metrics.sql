ALTER TABLE evaluation_metrics
  ADD COLUMN routing_id UUID REFERENCES routing_decisions(id);

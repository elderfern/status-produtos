CREATE TABLE estado (
  produto TEXT PRIMARY KEY,
  estado TEXT NOT NULL CHECK (estado IN ('no_ar','instavel','fora')),
  checado_em TEXT NOT NULL,
  falhas_seguidas INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE historial_stock
    ADD COLUMN origen_datos ENUM('real', 'simulado', 'sin_clasificar') NOT NULL DEFAULT 'sin_clasificar'
    AFTER stock_final;

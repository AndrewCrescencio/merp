-- P0.4: Kitchen ticket fix + product kitchenStationId + endpoints

-- 1. Adicionar kitchenStationId a product (opcional)
ALTER TABLE product ADD COLUMN kitchen_station_id text REFERENCES kitchen_station(id) ON DELETE SET NULL;

-- 2. Atualizar kitchen_ticket para permitir stationId NULL (fallback: ticket sem estação)
-- Ou melhor: manter NOT NULL e rejeitar se produto não tiver estação
-- Vamos manter NOT NULL para força o roteamento explícito
-- A migrate anterior deve garantir que todos os produtos tenham estação ou rejeitar

-- 3. Criar FK se não existir (para segurança)
ALTER TABLE product 
ADD CONSTRAINT product_kitchen_station_id_fkey 
FOREIGN KEY (kitchen_station_id) REFERENCES kitchen_station(id) ON DELETE SET NULL;

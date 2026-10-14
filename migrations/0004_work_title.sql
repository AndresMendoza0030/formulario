-- Agrega el título de trabajo a registros nuevos, sin perder aspirantes existentes.
-- Ejecutar una única vez antes de desplegar el Worker actualizado.
ALTER TABLE participants ADD COLUMN work_title TEXT NOT NULL DEFAULT '';

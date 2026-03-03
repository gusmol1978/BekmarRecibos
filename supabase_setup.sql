-- SETUP SUPABASE - Portal de Recibos
-- Ejecutar en el SQL Editor de tu proyecto Supabase

-- 1. Tabla de perfiles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  nombre_completo TEXT,
  rol TEXT DEFAULT 'empleado' CHECK (rol IN ('empleado', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trigger: crear perfil automaticamente al registrar usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Tabla de recibos
CREATE TABLE recibos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT DEFAULT 'Liquidacion de haberes',
  monto NUMERIC(12, 2),
  archivo_path TEXT NOT NULL,
  nombre_archivo TEXT,
  subido_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Habilitar Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos ENABLE ROW LEVEL SECURITY;

-- Politicas para profiles
CREATE POLICY "Ver propio perfil"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin ve todos los perfiles"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "Actualizar propio perfil"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Politicas para recibos
CREATE POLICY "Ver solo mis recibos"
  ON recibos FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin ve todos los recibos"
  ON recibos FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "Admin inserta recibos"
  ON recibos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "Admin elimina recibos"
  ON recibos FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

-- 5. Storage bucket para PDFs (privado)
INSERT INTO storage.buckets (id, name, public) VALUES ('recibos-pdf', 'recibos-pdf', false);

CREATE POLICY "Usuario descarga sus recibos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recibos-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admin sube recibos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'recibos-pdf' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "Admin elimina archivos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'recibos-pdf' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

-- Para hacer admin a un usuario despues de que se registre:
-- UPDATE profiles SET rol = 'admin' WHERE email = 'admin@tuempresa.com';

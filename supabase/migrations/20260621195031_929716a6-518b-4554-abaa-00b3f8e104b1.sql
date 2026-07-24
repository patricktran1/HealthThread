
ALTER TABLE public.health_events ADD COLUMN IF NOT EXISTS source_document_path text;

CREATE POLICY "users can read own health docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can upload own health docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can delete own health docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

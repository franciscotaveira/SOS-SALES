export function resolveCapiConfig(config: Record<string, any> = {}, secret: Record<string, any> = {}) {
  const clean = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  return {
    datasetId: clean(config.metaDatasetId) || clean(config.meta_capi_dataset_id) || clean(config.datasetId)
      || clean(config.metaPixelId) || clean(config.meta_capi_pixel_id) || clean(config.pixelId),
    accessToken: clean(secret.accessToken),
    enabled: config.metaCapiEnabled === true,
  };
}

import { BoundingBox, type Asset, type AnimTrack, type AppBase, type ContainerResource, type Entity, type RenderComponent } from "playcanvas";

export interface LoadedCharacter {
  model: Entity;
  tracks: AnimTrack[];
  /** Bind-pose bounds of the skinned mesh, for sanity checks (scale / ground contact). */
  bounds: BoundingBox;
  triangleCount: number;
}

/** Downloads with progress so a 20 MB GLB does not look like a hang on mobile. */
async function fetchWithProgress(url: string, onProgress: (loaded: number, total: number) => void): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Failed to download ${url}: ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(chunks, { type: "model/gltf-binary" });
}

/**
 * Loads the character GLB as a container, instantiates it with shadows enabled and returns its
 * animation tracks. The asset is used as-is: materials, textures, skeleton and clips come
 * straight from the file.
 */
export async function loadCharacter(
  app: AppBase,
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<LoadedCharacter> {
  const blob = await fetchWithProgress(url, onProgress);
  const blobUrl = URL.createObjectURL(blob);
  const filename = url.split("/").pop() ?? "character.glb";

  const asset = await new Promise<Asset>((resolve, reject) => {
    app.assets.loadFromUrlAndFilename(blobUrl, filename, "container", (error, loaded) => {
      if (error || !loaded) reject(new Error(`Failed to parse ${filename}: ${error}`));
      else resolve(loaded);
    });
  });
  URL.revokeObjectURL(blobUrl);

  const resource = asset.resource as ContainerResource;
  const model = resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
  // `animations` is documented on ContainerResource but missing from the published typings.
  const animations = (resource as unknown as { animations: Asset[] }).animations ?? [];
  const tracks = animations.map((animAsset) => animAsset.resource as AnimTrack);

  const bounds = new BoundingBox();
  let triangleCount = 0;
  let first = true;
  for (const render of model.findComponents("render") as RenderComponent[]) {
    for (const meshInstance of render.meshInstances) {
      const mesh = meshInstance.mesh;
      triangleCount += mesh.primitive[0].count / 3;
      if (first) bounds.copy(mesh.aabb);
      else bounds.add(mesh.aabb);
      first = false;
    }
  }
  return { model, tracks, bounds, triangleCount };
}

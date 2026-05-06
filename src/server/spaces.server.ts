import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient(): S3Client | null {
  const key = process.env.DO_SPACES_KEY?.trim();
  const secret = process.env.DO_SPACES_SECRET?.trim();
  const endpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  const region = process.env.DO_SPACES_REGION?.trim() ?? "sfo3";
  if (!key || !secret || !endpoint) return null;
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

const BUCKET = process.env.DO_SPACES_BUCKET?.trim() ?? "mocki-data";

export async function uploadToSpaces(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn("[spaces] DO_SPACES credentials not set — skipping upload");
    return null;
  }
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: "private",
      }),
    );
    return key;
  } catch (err) {
    console.error("[spaces] upload failed:", err);
    return null;
  }
}

export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "private",
    });
    return await getSignedUrl(client, cmd, { expiresIn });
  } catch (err) {
    console.error("[spaces] presign failed:", err);
    return null;
  }
}

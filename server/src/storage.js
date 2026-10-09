import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";

export function diskStorage(directory) {
  return {
    async put(buffer) {
      await mkdir(directory, { recursive: true });
      const location = path.join(directory, `${randomUUID()}.pdf`);
      await writeFile(location, buffer);
      return location;
    },
    read: (location) => readFile(location),
    remove: (location) => unlink(location),
  };
}

// Durable private storage; never expose a public document URL.
export function gridFsStorage() {
  const bucket = () =>
    new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "printFiles",
    });
  return {
    async put(buffer) {
      const stream = bucket().openUploadStream(`${randomUUID()}.pdf`, {
        metadata: { contentType: "application/pdf" },
      });
      stream.end(buffer);
      try {
        await finished(stream);
      } catch (error) {
        await bucket()
          .delete(stream.id)
          .catch(() => {});
        throw error;
      }
      return String(stream.id);
    },
    async read(id) {
      const chunks = [];
      for await (const chunk of bucket().openDownloadStream(
        new mongoose.Types.ObjectId(id),
      ))
        chunks.push(chunk);
      return Buffer.concat(chunks);
    },
    remove: (id) => bucket().delete(new mongoose.Types.ObjectId(id)),
  };
}

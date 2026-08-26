import crypto from 'node:crypto';

export interface DecryptedFlowRequest<T = any> {
  version: string;
  action: 'ping' | 'INIT' | 'data_exchange' | 'BACK' | string;
  screen?: string;
  data?: T;
  flow_token?: string;
}

export class FlowCrypto {
  /**
   * Decrypts the incoming Meta WhatsApp Flows payload.
   * Uses RSA-OAEP with SHA-256 for the AES key, and AES-128-GCM for the body data.
   */
  public static decryptRequest(
    encryptedFlowData: string,
    encryptedAesKey: string,
    initialVector: string,
    privateKeyPem: string,
    passphrase?: string
  ): {
    decryptedBody: DecryptedFlowRequest;
    aesKeyBuffer: Buffer;
    initialVectorBuffer: Buffer;
  } {
    const flowDataBuffer = Buffer.from(encryptedFlowData, 'base64');
    const initialVectorBuffer = Buffer.from(initialVector, 'base64');

    // 1. Decrypt AES Key using RSA Private Key
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKeyPem,
        passphrase,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedAesKey, 'base64')
    );

    // 2. Decrypt Flow Data Body using AES-128-GCM
    const TAG_LENGTH = 16;
    const encryptedBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
    const authTag = flowDataBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-128-gcm', decryptedAesKey, initialVectorBuffer);
    decipher.setAuthTag(authTag);

    const decryptedJSONString = Buffer.concat([
      decipher.update(encryptedBody),
      decipher.final(),
    ]).toString('utf-8');

    return {
      decryptedBody: JSON.parse(decryptedJSONString),
      aesKeyBuffer: decryptedAesKey,
      initialVectorBuffer,
    };
  }

  /**
   * Encrypts the response payload to return to Meta WhatsApp Flows.
   * Flips the bits of the initial vector and encrypts using AES-128-GCM.
   */
  public static encryptResponse(
    response: Record<string, any>,
    aesKeyBuffer: Buffer,
    initialVectorBuffer: Buffer
  ): string {
    const flippedIv: number[] = [];
    for (const pair of initialVectorBuffer.entries()) {
      flippedIv.push(~pair[1]);
    }

    const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, Buffer.from(flippedIv));
    return Buffer.concat([
      cipher.update(JSON.stringify(response), 'utf-8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }

  /**
   * Generates a standard RSA 2048-bit key pair for WhatsApp Flows encryption
   */
  public static generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
}

/* tslint:disable:no-console */
import {
  Cargo,
  CargoCollectionAuthorization,
  CargoDeliveryRequest,
  Certificate,
  generateRSAKeyPair,
  issueGatewayCertificate,
} from '@relaycorp/relaynet-core';
import * as fs from 'fs';

import { CogRPCClient } from './lib/client';

// Config:
const SERVER = '192.168.43.1:21473';
const CERT_PATH = '/tmp/cert.pem';
const USE_TLS = true;
// End of config

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);

async function main(): Promise<void> {
  console.log('About to create client');
  const client = new CogRPCClient(SERVER, USE_TLS, fs.readFileSync(CERT_PATH));

  const privateGatewayKeyPair = await generateRSAKeyPair();
  const privateGatewayCertificate = await issueGatewayCertificate({
    issuerPrivateKey: privateGatewayKeyPair.privateKey,
    subjectPublicKey: privateGatewayKeyPair.publicKey,
    validityEndDate: TOMORROW,
  });

  console.log('About to deliver cargo');
  const cargoes = generateCargo(privateGatewayKeyPair.privateKey, privateGatewayCertificate);
  for await (const ack of client.deliverCargo(cargoes)) {
    console.log('Delivered', ack);
  }

  console.log('About to collect cargo');
  const ccaSerialized = await generateCCA(
    privateGatewayKeyPair.privateKey,
    privateGatewayCertificate,
  );
  for await (const cargo of client.collectCargo(ccaSerialized)) {
    console.log(`Got cargo with ${cargo.byteLength} bytes`);
  }

  client.close();
}

async function* generateCargo(
  senderPrivateKey: CryptoKey,
  senderCertificate: Certificate,
): AsyncIterable<CargoDeliveryRequest> {
  // tslint:disable-next-line:no-let
  for (let i = 0; i < 10; i++) {
    console.log('Generating cargo', i);
    const cargo = new Cargo('https://example.com', senderCertificate, Buffer.from([i]));
    const cargoSerialized = Buffer.from(await cargo.serialize(senderPrivateKey));
    yield { cargo: cargoSerialized, localId: i.toString() };
  }
}

async function generateCCA(
  senderPrivateKey: CryptoKey,
  senderCertificate: Certificate,
): Promise<Buffer> {
  const cca = new CargoCollectionAuthorization(
    'https://example.com',
    senderCertificate,
    Buffer.from([]),
  );
  return Buffer.from(await cca.serialize(senderPrivateKey));
}

main();

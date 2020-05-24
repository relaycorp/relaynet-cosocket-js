/* tslint:disable:no-console */

/**
 * NB: In the current version of this library, you have to download the TLS certificate by
 * yourself. For example:
 *
 * openssl s_client -connect 192.168.43.1:21473 -showcerts </dev/null 2>/dev/null |  openssl x509 -outform PEM > /tmp/cert.pem
 */

import {
  Cargo,
  CargoCollectionAuthorization,
  CargoDeliveryRequest,
  Certificate,
  generateRSAKeyPair,
  issueGatewayCertificate,
} from '@relaycorp/relaynet-core';

import { CogRPCClient } from './lib/client';

// Config:
const SERVER = 'https://192.168.43.1:21473';
// End of config

const FIVE_MINS_AGO = new Date();
FIVE_MINS_AGO.setMinutes(FIVE_MINS_AGO.getMinutes() - 5);

const oneMinuteAgo = new Date();
oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);

const DUMMY_CARGO_PAYLOAD = Buffer.from('a'.repeat(1024 * 512));

async function main(): Promise<void> {
  console.log('About to create client');
  const client = await CogRPCClient.init(SERVER);

  const privateGatewayKeyPair = await generateRSAKeyPair();
  const privateGatewayCertificate = await issueGatewayCertificate({
    issuerPrivateKey: privateGatewayKeyPair.privateKey,
    subjectPublicKey: privateGatewayKeyPair.publicKey,
    validityEndDate: TOMORROW,
    validityStartDate: FIVE_MINS_AGO,
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
  for (let i = 0; i < 30; i++) {
    console.log('Generating cargo', i);
    const payload = Buffer.concat([DUMMY_CARGO_PAYLOAD, Buffer.from([i])]);
    const cargo = new Cargo('https://example.com', senderCertificate, payload, {
      date: oneMinuteAgo,
      ttl: 86_4000,
    });
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
    { date: oneMinuteAgo, ttl: 86_400 },
  );
  return Buffer.from(await cca.serialize(senderPrivateKey));
}

main();

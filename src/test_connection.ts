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

if (process.argv.length !== 3) {
  console.error('Expected exactly one CLI argument: The gRPC server IP');
  process.exit(1);
}
const SERVER_HOSTNAME = process.argv[2];

const SERVER_URL = `https://${SERVER_HOSTNAME}:21473`;

const FIVE_MINS_AGO = new Date();
FIVE_MINS_AGO.setMinutes(FIVE_MINS_AGO.getMinutes() - 5);

const TWO_MINUTES_AGO = new Date();
TWO_MINUTES_AGO.setMinutes(TWO_MINUTES_AGO.getMinutes() - 2);

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);

const DUMMY_CARGO_PAYLOAD = Buffer.from('a'.repeat(1024 * 512));

async function main(): Promise<void> {
  console.log('About to connect to', SERVER_URL);
  const client = await CogRPCClient.init(SERVER_URL);

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
  for (let i = 0; i < 5; i++) {
    console.log('Generating cargo', i);
    const payload = Buffer.concat([DUMMY_CARGO_PAYLOAD, Buffer.from([i])]);
    const cargo = new Cargo('https://example.com', senderCertificate, payload, {
      creationDate: TWO_MINUTES_AGO,
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
    { creationDate: TWO_MINUTES_AGO, ttl: 86_400 },
  );
  return Buffer.from(await cca.serialize(senderPrivateKey));
}

main();

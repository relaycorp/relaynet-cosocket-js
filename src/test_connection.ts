/* tslint:disable:no-console */
import { CargoDeliveryRequest } from '@relaycorp/relaynet-core';
import * as fs from 'fs';

import { CogRPCClient } from './lib/client';

// Config:
const SERVER = '127.0.0.1:8081';
const CERT_PATH = '/tmp/cert.pem';
const USE_TLS = true;
// End of config

const LARGE_DUMMY_CARGO = Buffer.from('A'.repeat(8_388_608)); // 8 MiB

const DUMMY_CCA = Buffer.from('B'.repeat(1_300));

async function main(): Promise<void> {
  console.log('About to create client');
  const client = new CogRPCClient(SERVER, USE_TLS, fs.readFileSync(CERT_PATH));

  console.log('About to deliver cargo');
  for await (const ack of client.deliverCargo(generateDummyCargo())) {
    console.log('Delivered', ack);
  }

  console.log('About to collect cargo');
  for await (const cargo of client.collectCargo(DUMMY_CCA)) {
    console.log(`Got cargo with ${cargo.byteLength} bytes`);
  }

  client.close();
}

function* generateDummyCargo(): IterableIterator<CargoDeliveryRequest> {
  // tslint:disable-next-line:no-let
  for (let i = 0; i < 10; i++) {
    yield { cargo: LARGE_DUMMY_CARGO, localId: `local-id-${i}` };
  }
}

main();

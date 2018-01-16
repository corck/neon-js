import axios from 'axios'
import { Balance, Claims } from '../wallet'
import { Fixed8 } from '../utils'
import logger from '../logging'

const log = logger('api')
export const name = 'neoscan'
/**
 * Returns the appropriate NeoScan endpoint.
 * @param {string} net - 'MainNet', 'TestNet' or a custom NeoScan-like url.
 * @return {string} - URL
 */
export const getAPIEndpoint = (net) => {
  switch (net) {
    case 'MainNet':
      return 'https://neoscan.io/api/main_net'
    case 'TestNet':
      return 'https://neoscan-testnet.io/api/test_net'
    default:
      return net
  }
}

/**
 * Returns an appropriate RPC endpoint retrieved from a NeoScan endpoint.
 * @param {string} net - 'MainNet', 'TestNet' or a custom NeoScan-like url.
 * @return {Promise<string>} - URL
 */
export const getRPCEndpoint = (net) => {
  const apiEndpoint = getAPIEndpoint(net)
  return axios.get(apiEndpoint + '/v1/get_all_nodes')
    .then(({ data }) => {
      let bestHeight = 0
      let nodes = []
      for (const node of data) {
        if (node.height > bestHeight) {
          bestHeight = node.height
          nodes = [node]
        } else if (node.height === bestHeight) {
          nodes.push(node)
        }
      }
      const selectedURL = nodes[Math.floor(Math.random() * nodes.length)].url
      log.info(`Best node from neoscan ${net}: ${selectedURL}`)
      return selectedURL
    })
}

/**
 * Gat balances for an address.
 * @param {string} net - 'MainNet', 'TestNet' or a custom NeoScan-like url.
 * @param {string} address - Address to check.
 * @return {Balance}
  */
export const getBalance = (net, address) => {
  const apiEndpoint = getAPIEndpoint(net)
  return axios.get(apiEndpoint + '/v1/get_balance/' + address)
    .then((res) => {
      const bal = new Balance({ address: res.data.address, net })
      res.data.balance.map((b) => {
        bal.addAsset(b.asset, {
          balance: b.amount,
          unspent: parseUnspent(b.unspent)
        })
      })
      log.info(`Retrieved Balance for ${address} from neoscan ${net}`)
      return bal
    })
}

/**
 * Get claimable amounts for an address.
 * @param {string} net - 'MainNet', 'TestNet' or a custom NeoScan-like url.
 * @param {string} address - Address to check.
 * @return {Promise<Claim>}
 */
export const getClaims = (net, address) => {
  const apiEndpoint = getAPIEndpoint(net)
  return axios.get(apiEndpoint + '/v1/get_claimable/' + address)
    .then((res) => {
      const claims = parseClaims(res.data.claimable)
      log.info(`Retrieved Balance for ${address} from neoscan ${net}`)
      return new Claims({ net, address: res.data.address, claims })
    })
}

const parseUnspent = (unspentArr) => {
  return unspentArr.map((coin) => {
    return {
      index: coin.n,
      txid: coin.txid,
      value: coin.value
    }
  })
}

const parseClaims = (claimArr) => {
  return claimArr.map((c) => {
    return {
      start: new Fixed8(c.start_height),
      end: new Fixed8(c.end_height),
      index: c.n,
      claim: new Fixed8(c.unclaimed),
      txid: c.txid,
      value: c.value
    }
  })
}

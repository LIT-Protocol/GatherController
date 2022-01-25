# Lit Gather Controller

Teleports people who aren't allowed to be in the room, out of the room.

## Code to store the signing conditions (run in browser with lit node connection)

```
const addys = {
  ethereum: [
      "0xf5b0a3efb8e8e4c201e2a935f110eaaf3ffecb8d", // axie infinity
      "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6", // Wrapped Cryptopunks
      "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb", // non wrapped punks
      "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // Bored Ape Yacht Club
      "0xff488fd296c38a24cccc60b43dd7254810dab64e", // Zed Run
      "0x4b3406a41399c7FD2BA65cbC93697Ad9E7eA61e5", // LOSTPOETS
      "0xa3aee8bce55beea1951ef834b99f3ac60d1abeeb", // VeeFriends
      "0x57a204aa1042f6e66dd7730813f4024114d74f37", // CyberKongz
      "0x7EA3Cca10668B8346aeC0bf1844A49e995527c8B", // cyberkongz vx
      "0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7", // Loot
      "0x7Bd29408f11D2bFC23c34f18275bBf23bB716Bc7", // Meebits
      "0x10daa9f4c0f985430fde4959adb2c791ef2ccf83", // Metakey
    ],
    polygon: [
      "0xA3D109E28589D2AbC15991B57Ce5ca461Ad8e026"  // lit genesis gate
    ]
}

const resourceIds = []

Object.keys(addys).forEach(k => {
  console.log(`processing chain ${k}`)
  addys[k].forEach(async addr => {
    console.log(`processing address ${addr}`)
    // store condition
    const chain = k
    const authSig = await LitJsSdk.checkAndSignAuthMessage({chain})
    const accessControlConditions = [
      {
        contractAddress: addr,
        standardContractType: 'ERC721',
        chain,
        method: 'balanceOf',
        parameters: [
          ':userAddress'
        ],
        returnValueTest: {
          comparator: '>',
          value: '0'
        }
      }
    ]
    const extraData = JSON.stringify({chain, contractAddress: addr})
    const resourceId = {
      baseUrl: 'gather.town',
      path: '/app/tXVe5OYt6nHS9Ey5/lit-protocol',
      orgId: "",
      role: "",
      extraData
    }
    resourceIds.push({addr, resourceId, chain})
    await litNodeClient.saveSigningCondition({ accessControlConditions, chain, authSig, resourceId })

  })
})

console.log(JSON.stringify(resourceIds))

```

## Code to store the conditions for cryptoarcade

```
const chain = 'harmony'
const authSig = await LitJsSdk.checkAndSignAuthMessage({chain})
const accessControlConditions = [
  {
    contractAddress: '0x508f6057612b30b024dd054cabdf0c46a7124087',
    standardContractType: 'ERC1155',
    chain,
    method: 'balanceOf',
    parameters: [
      ':userAddress',
      '1053985237318200751294693195373338487820285140688',
    ],
    returnValueTest: {
      comparator: '>',
      value: '0',
    },
  },
]

resourceId = {
        baseUrl: 'gather.town',
        path: 'IIiU7UpulMdbsQ3w/nostalgea',
        orgId: '',
        role: '',
        extraData:
          '{"chain":"harmony","contractAddress":"0x508f6057612b30b024dd054cabdf0c46a7124087"}',
      }

await litNodeClient.saveSigningCondition({ accessControlConditions, chain, authSig, resourceId })
```

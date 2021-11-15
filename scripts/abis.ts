import * as dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const abisDir = process.env.ABI_DIR
const buildDir = './artifacts/contracts/'

if (!fs.existsSync(abisDir)) {
    throw new Error('ABI directory not exists')
}
if (!fs.existsSync(buildDir)) {
    throw new Error('No truffle build/contracts directory')
}

const files = fs.readdirSync(buildDir)
for (let i = files.length - 1; i >= 0; i = -1) {
    const name = files[i]
    const jsonName = name.split('.sol')[0] + '.json'
    const contents = fs.readFileSync(`${buildDir}${name}/${jsonName}`, 'utf8')
    const contract = JSON.parse(contents)
    const abi = JSON.stringify(contract.abi)
    fs.writeFileSync(abisDir + name.toLocaleLowerCase(), abi, 'utf8')
    console.log(`${name}: Done`)
}

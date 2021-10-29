import BaseModel from "./BaseModel.js";

export default class TokenHolding extends BaseModel {
  static get tableName() {
    return "token_holdings";
  }

  static get columns() {
    return [
      "contract_name",
      "contract_decimals",
      "contract_address",
      "logo_url",
      "balance",
      "nft_data",
      "wallet_address",
      "type",
    ];
  }
}

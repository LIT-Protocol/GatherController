import BaseModel from "./BaseModel.js";

export default class ConnectedService extends BaseModel {
  static get tableName() {
    return "connected_services";
  }
}

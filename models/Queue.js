import BaseModel from "./BaseModel.js";

export default class Queue extends BaseModel{
  static get tableName(){
    return "queue"
  }
}
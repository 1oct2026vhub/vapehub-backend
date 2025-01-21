// Helper for standardizing response body
class ResponseHelper {
  constructor(res) {
    this.res = res;
  }

  failed(known=false) {
    this._failed = true;
    this._known = known;
    return this;
  }

  // set the status of the response
  status(statusCode) {
    this._status = statusCode;
    if(this._status<300 && this._status>=200)
      this._message = "Success"
    else if(this._status>400)
      this._message = "Failed"
    return this;
  }

  // response payload message
  message(message) {
    this._message = message;
    return this;
  }

  // response payload data
  payload(data){
    this._payload = data
    return this;
  }
  // send the response
  send() {
    const body = {
      message: this._message,
      payload: this._payload,
      success: !this._failed,
    }
    if(this._failed) {
      body.known = this._known;
    }
    return this.res.status(this._status).json(body)
  }
}

// the middleware to apply this helper
const responseHelperMiddleware = (req, res, next) => {
  res.helper = new ResponseHelper(res);
  next();
}

module.exports = responseHelperMiddleware

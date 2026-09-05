import axios from 'axios'

export default {
  install: (app, options) => {
    const axiosPlain = axios.create({
      baseURL: options.baseUrl,
      withCredentials: false,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    })
    axiosPlain.interceptors.request.use(request => {
      console.log('Axios request: ' + request.method + ':' + request.url)
      return request
    })  
    app.provide('axiosPlain', axiosPlain)

    const axiosLong = axios.create({
      baseURL: options.baseUrl,
      withCredentials: false,
      timeout: 25000,
      headers: { 'Content-Type': 'application/json' }
    })
    axiosLong.interceptors.request.use(request => {
      console.log('Axios request: ' + request.method + ':' + request.url)
      return request
    })  
    app.provide('axiosLong', axiosLong)
    const axiosUpload = axios.create({
      baseURL: options.baseUrl,
      withCredentials: false,
      timeout: 25000,
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    
    axiosUpload.interceptors.request.use(request => {
      console.log('Axios Upload request: ' + request.method + ':' + request.url)
      return request
    })  

    app.provide('axiosUpload', axiosUpload)    


    const axiosStatic = axios.create({
      baseURL: options.baseUrlStatic,
      withCredentials: false,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    })
    axiosStatic.interceptors.request.use(request => {
      console.log('Axios request: ' + request.method + ':' + request.url)
      return request
    })  
    app.provide('axiosStatic', axiosStatic)    
  }
}
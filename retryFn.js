function retryFunction(fn, tries) {
    
    return new Promise((resolve) => {

      const attempt = () => {
        console.log('tries :>> ', tries);
        fn().then(resolve).catch(error => {
            console.log('retryFunction error :>> ', JSON.stringify(error));
            if (tries <= 1) {
                console.log("complete");
                resolve(null)
              } else {
                tries--;
                attempt();
              }
        });
      };
      attempt();
    });
  }
  
  // Uso de la función con una función que retorna una promesa:
  function myAsyncFunction() {
    return new Promise((resolve, reject) => {
      if (Math.random() > 0.5) {
        resolve('Éxito');
      } else {
        reject(new Error('Falló'));
      }
    });
  }
  
  retryFunction(myAsyncFunction, 5)
    .then(console.log)
    .catch(console.error);
  
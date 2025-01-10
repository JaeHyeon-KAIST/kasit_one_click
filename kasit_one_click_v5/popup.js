document.addEventListener('DOMContentLoaded', () => {
    const naverOption = document.querySelector('input[name="mail"][value="naver"]');
    const googleOption = document.querySelector('input[name="mail"][value="google"]');
  
    chrome.storage.local.get('mailOption', (data) => {
      if (data.mailOption === 'google') {
        googleOption.checked = true;
      } else {
        naverOption.checked = true;
      }
    });
  
    const saveMailOption = (option) => {
      chrome.runtime.sendMessage({ action: "saveMailOption", mailOption: option }, (response) => {
        if (response.status === "success") {
          console.log("Mail option saved successfully");
        } else {
          console.error("Failed to save mail option");
        }
      });
    };
  
    naverOption.addEventListener('change', () => {
      if (naverOption.checked) {
        saveMailOption('naver');
      }
    });
  
    googleOption.addEventListener('change', () => {
      if (googleOption.checked) {
        saveMailOption('google');
      }
    });
  });
  
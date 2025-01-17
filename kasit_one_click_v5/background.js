chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startAuthProcess") {
    console.log("Received message to start auth process");

    chrome.storage.local.get("mailOption", (data) => {
      const mailOption = data.mailOption || "naver";
      console.log("Selected mail option:", mailOption);

      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const currentTabId = tabs[0].id;

        const clickButton = async (selector, tabId, nextFunc, interval = 50, maxAttempts = 10) => {
          let attempts = 0;

          console.log(attempts);

          const tryClickButton = async () => {
            attempts++;
            const [result] = await chrome.scripting.executeScript({
              target: {tabId: tabId}, func: (selector) => {
                const button = document.querySelector(selector);
                console.log(`Attempting to click button: ${selector}`);
                if (button) {
                  console.log(`Button found: ${button}`);
                  button.click();
                  return {clicked: true, url: window.location.href};
                } else {
                  console.log(`Button not found: ${selector}`);
                  return {clicked: false};
                }
              }, args: [selector]
            });

            if (result.result.clicked) {
              const initialUrl = result.result.url;
              chrome.tabs.get(tabId, (tab) => {
                if (tab.url !== initialUrl) {
                  chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
                    if (tabId === currentTabId && changeInfo.status === "complete" && tab.url !== initialUrl) {
                      console.log(`${selector} button click complete and page loaded`);
                      chrome.tabs.onUpdated.removeListener(listener);
                      nextFunc();
                    }
                  });
                } else {
                  nextFunc();
                }
              });
            } else if (attempts < maxAttempts) {
              console.log(`Retrying to click button: ${selector}, attempt ${attempts}`);
              setTimeout(tryClickButton, interval);
            } else {
              console.error(`Failed to click button: ${selector} after ${maxAttempts} attempts`);
              sendResponse({status: "error", message: `Button not found: ${selector}`});
            }
          };

          tryClickButton();
        };

        const startMailAuthProcess = async () => {
          let mailUrl;
          if (mailOption === "naver") {
            //await new Promise(resolve => setTimeout(resolve, 1300));
            mailUrl = "https://mail.naver.com/v2/folders/0/all";
          } else if (mailOption === "google") {
            //await new Promise(resolve => setTimeout(resolve, 2200));
            mailUrl = "https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox";
          }

          chrome.tabs.create({url: mailUrl, active: false}, (tab) => {
            const mailTabId = tab.id;

            const extractAuthCode = () => {
              chrome.scripting.executeScript({
                target: {tabId: mailTabId}, func: (mailOption) => {
                  return new Promise((resolve) => {
                    const MAX_WAIT_TIME = 30000; // 30 seconds in milliseconds
                    const startTime = Date.now();

                    const findMailLinks = async () => {
                      let mailLinks;
                      if (mailOption === "naver") {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        // mailLinks = document.querySelectorAll(".mail_title_link");
                        const allMailItems = document.querySelectorAll(".mail_item");
                        mailLinks = Array.from(allMailItems)
                        .filter(item => {
                          // 'read' 클래스를 가진 메일은 제외
                          if (item.classList.contains("read")) {
                            return false;
                          }

                          const textElement = item.querySelector(".mail_title .text");
                          if (!textElement || !textElement.textContent.includes("[카이스트] 인증 번호 입니다.")) {
                            return false;
                          } // 메일 제목에 "[카이스트] 인증 번호 입니다."가 없는 경우 제외

                          // 메일의 날짜를 가져오기
                          const dateElement = item.querySelector(".mail_date_wrap .mail_date");
                          if (!dateElement) {
                            return false;
                          } // 날짜 요소가 없는 경우 제외

                          const dateText = dateElement.textContent; // 예: "오후 05:04"
                          const match = dateText.match(/(오전|오후)\s*(\d+):(\d+)/);

                          if (match) {
                            const [_, ampm, hours, minutes] = match;
                            let hour = parseInt(hours, 10);
                            const minute = parseInt(minutes, 10);

                            // 시간 변환 (오후 시간 처리)
                            if (ampm === "오후" && hour < 12) {
                              hour += 12;
                            }
                            if (ampm === "오전" && hour === 12) {
                              hour = 0;
                            }

                            // 메일 시간을 Date 객체로 생성
                            const now = new Date();
                            const mailTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

                            // 시간 차이 계산
                            const timeDiff = Date.now() - mailTime.getTime();
                            return timeDiff >= 0 && timeDiff <= 60000; // 1분 이내
                          }

                          return false; // 날짜 형식이 맞지 않으면 제외
                        })
                        .map(item => item.querySelector(".mail_title_link")); // 메일 링크를 추출

                        console.log("Filtered mail links:", mailLinks);
                      } else if (mailOption === "google") {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const allMailItems = document.querySelectorAll(".zE");
                        mailLinks = Array.from(allMailItems)
                        .filter(item => {
                          const textElement = item.querySelector(".bqe");
                          if (!textElement || !textElement.textContent.includes("[카이스트] 인증 번호 입니다.")) {
                            return false;
                          } // 메일 제목에 "[카이스트] 인증 번호 입니다."가 없는 경우 제외

                          // 메일의 날짜를 가져오기
                          const timeElement = item.querySelector(".xW span[title]");
                          if (timeElement) {
                            const timeText = timeElement.getAttribute("title"); // 예: "2025년 1월 17일 (금) 오후 2:29"
                            if (timeText) {
                              const match = timeText.match(/(\d+)년 (\d+)월 (\d+)일.*(오전|오후)\s*(\d+):(\d+)/);
                              if (match) {
                                const [, year, month, day, ampm, hour, minute] = match;

                                let parsedHour = parseInt(hour, 10);
                                if (ampm === "오후" && parsedHour < 12) {
                                  parsedHour += 12;
                                } else if (ampm === "오전" && parsedHour === 12) {
                                  parsedHour = 0;
                                }

                                const timeDiff = Date.now() - new Date(parseInt(year, 10),          // 연도
                                  parseInt(month, 10) - 1,     // 월 (0부터 시작)
                                  parseInt(day, 10),           // 일
                                  parsedHour,                  // 시
                                  parseInt(minute, 10)         // 분
                                ).getTime();
                                return timeDiff >= 0 && timeDiff <= 60000; // 1분 이내
                              }
                              return false;
                            }
                          }
                          return false;
                        })
                        .map(item => item.querySelector(".xS")); // 메일 링크를 추출
                      }

                      console.log(mailLinks);

                      if (mailLinks && mailLinks.length > 0) {
                        console.log("Found mail links");
                        mailLinks[0].click();

                        const checkMailContent = async () => {
                          let contentElement;

                          if (mailOption === "naver") {
                            contentElement = document.querySelector(".mail_view_contents_inner");

                            if (contentElement) {
                              const content = contentElement.innerText;
                              const match = content.match(/\b\d{6}\b/);
                              // resolve(match ? match[0] : "No auth code found");
                              if (match) {
                                const deleteButton = document.querySelector(".button_task.svg_delete");
                                if (deleteButton) {
                                  console.log("Found delete button. Clicking to delete the mail...");
                                  deleteButton.click(); // 삭제 버튼 클릭
                                  console.log("Mail deletion initiated.");
                                } else {
                                  console.error("Delete button not found. Mail deletion failed.");
                                }

                                resolve(match[0]);
                              } else {
                                resolve("No auth code found(에러 발생)");
                              }
                            } else {
                              setTimeout(checkMailContent, 100);
                            }
                          } else if (mailOption === "google") {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            const contentElements = document.querySelectorAll(".a3s.aiL");
                            const contentElement = contentElements[contentElements.length - 1]; // 가장 최근 메일의 본문

                            if (contentElement) {
                              const content = contentElement.innerText; // 메일 본문 텍스트 가져오기
                              const match = content.match(/\b\d{6}\b/); // 6자리 인증 번호 찾기
                              if (match) {
                                console.log("Auth code found:", match[0]);

                                // 메일 삭제 버튼 클릭
                                const deleteButton = document.querySelector("div[act='10']");
                                if (deleteButton) {
                                  console.log("Found delete button. Clicking to delete the mail...");
                                  deleteButton.click(); // 삭제 버튼 클릭
                                  console.log("Mail deletion initiated.");
                                } else {
                                  console.error("Delete button not found. Mail deletion failed.");
                                }

                                resolve(match[0]); // 인증 번호 반환
                              } else {
                                console.error("No auth code found in mail content.");
                                resolve("No auth code found.");
                              }
                            } else {
                              setTimeout(checkMailContent, 100); // 본문을 찾지 못했을 경우 재시도
                            }
                          }
                        };

                        setTimeout(checkMailContent, 100);
                      } else {
                        // Only check timeout when we haven't found any mails
                        if (Date.now() - startTime > MAX_WAIT_TIME) {
                          console.log("Timeout reached while searching for mails");
                          resolve("Timeout: No authentication mail found");
                          return;
                        }
                        console.log("No mail links found. Retrying...");

                        if (mailOption === "naver") {
                          // '받은메일함' 탭 클릭
                          const inboxTab = document.querySelectorAll("ul.smart_tab_list .smart_tab_link.selected")[0];
                          if (inboxTab) {
                            console.log("Found '받은메일함' tab. Clicking to refresh mail list...");
                            inboxTab.click(); // 클릭 이벤트 트리거

                            setTimeout(findMailLinks, 100);
                          } else {
                            setTimeout(findMailLinks, 100);
                          }
                        } else {
                          // '받은메일함' 탭 클릭
                          const inboxButton = document.querySelector("a[aria-label^='받은편지함']");
                          if (inboxButton) {
                            inboxButton.click(); // 클릭 이벤트 트리거

                            setTimeout(findMailLinks, 100);
                          } else {
                            setTimeout(findMailLinks, 100);
                          }
                        }
                      }
                    };

                    findMailLinks();
                  });
                }, args: [mailOption]
              }).then(results => {
                const authCode = results[0].result;
                console.log("Auth code extracted:", authCode);

                if (authCode && authCode.match(/^\d{6}$/)) {
                  chrome.windows.getCurrent((currentWindow) => {
                    chrome.tabs.query({active: true, windowId: currentWindow.id}, (tabs) => {
                      if (tabs.length === 0) {
                        console.error("No active tab found.");
                        sendResponse({status: "error", message: "No active tab found."});
                        chrome.tabs.remove(mailTabId);
                        return;
                      }

                      const currentTabId = tabs[0].id;
                      console.log("Current tab ID:", currentTabId);

                      chrome.tabs.update(currentTabId, {active: true}, () => {
                        chrome.tabs.remove(mailTabId, () => {
                          enterAuthCode(authCode, currentTabId, sendResponse);
                        });
                      });
                    });
                  });
                } else {
                  if (authCode.startsWith("Timeout:")) {
                    console.log("Timeout occurred:", authCode);
                    sendResponse({status: "error", message: authCode});
                  } else {
                    console.log("Invalid auth code:", authCode);
                    sendResponse({status: "error", message: "Invalid authentication code"});
                  }
                  chrome.tabs.remove(mailTabId);
                }
              }).catch(error => {
                console.error("Scripting error:", error.message);
                sendResponse({status: "error", message: "Error: " + error.message});
                chrome.tabs.remove(mailTabId);
              });
            };

            const enterAuthCode = async (authCode, currentTabId, sendResponse) => {
              chrome.scripting.executeScript({
                target: {tabId: currentTabId}, func: async (code) => {
                  const results = {
                    authInputFound: false, loginButtonClicked: false
                  };

                  const authInput = document.querySelector("input#crtfc_no[name=\"crtfc_no\"][type=\"text\"]");
                  if (authInput) {
                    console.log("Auth input field found.");
                    authInput.value = code;
                    results.authInputFound = true;

                    // Trigger 'input' event to ensure any listeners detect the value change
                    const inputEvent = new Event("input", {bubbles: true});
                    authInput.dispatchEvent(inputEvent);

                    console.log("Auth code entered. Trying to click the Login button...");

                    // Retry logic to find and click the 'Login' button
                    let attempts = 0;
                    const maxAttempts = 10;
                    const tryClickLogin = async () => {
                      const langElement = document.querySelector(".box04 ul li.on a");
                      let lang = langElement ? langElement.textContent.trim().toLowerCase() : "unknown";
                      let buttonValue;
                      if (lang === "kor") {
                        buttonValue = "로그인"; // 한국어 환경의 버튼 값
                      } else if (lang === "eng") {
                        buttonValue = "Login"; // 영어 환경의 버튼 값
                      } else {
                        console.warn(`Unsupported language: ${lang}`);
                        buttonValue = null;
                      }

                      if (buttonValue) {
                        const loginButton = document.querySelector(`input[type="submit"][value="${buttonValue}"][onclick="return loginProc();"]`);
                        if (loginButton) {
                          console.log(`Found login button for ${lang}. Clicking...`);
                          loginButton.click();
                        } else {
                          console.error(`Login button not found for language: ${lang}`);
                        }
                      } else if (attempts < maxAttempts) {
                        attempts++;
                        console.log(`Retrying to find and click Login button (attempt ${attempts})`);
                        setTimeout(tryClickLogin, 500); // Retry every 500ms
                      } else {
                        console.error("Failed to find Login button after maximum attempts.");
                      }

                      // const loginButton = document.querySelector("input[type=\"submit\"][value=\"Login\"][onclick=\"return loginProc();\"]");
                      //
                      //
                      // if (loginButton) {
                      //   console.log("Login button found and clicked.");
                      //   loginButton.click();
                      //   results.loginButtonClicked = true;
                      // } else if (attempts < maxAttempts) {
                      //   attempts++;
                      //   console.log(`Retrying to find and click Login button (attempt ${attempts})`);
                      //   setTimeout(tryClickLogin, 500); // Retry every 500ms
                      // } else {
                      //   console.error("Failed to find Login button after maximum attempts.");
                      // }
                    };

                    tryClickLogin();
                  } else {
                    console.error("Auth input field not found.");
                  }

                  return results;
                }, args: [authCode]
              }).then(results => {
                console.log("Auth code entry and Login button click results:", results[0].result);
                sendResponse({status: "success", results: results[0].result});
              }).catch(error => {
                console.error("Error during auth code entry and Login button click:", error.message);
                sendResponse({status: "error", message: error.message});
              });
            };

            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
              if (tabId === mailTabId && changeInfo.status === "complete") {
                console.log("Mail page loaded");
                chrome.tabs.onUpdated.removeListener(listener);
                extractAuthCode();
              }
            });
          });
        };

        const step3 = async () => {
          console.log("Entering step 3: Navigating to external mail authentication");
          await clickButton("input[type=\"submit\"][id=\"email\"]", currentTabId, () => { //<input style="cursor:pointer;" type="submit" id="email" class="btn_basic btn_factor" value="외부 메일 : s*********6@naver.com" onclick="return fnCrtfcNoReq.call( this, 'Mail' );">
            console.log("Step 3 completed. Starting mail auth process");
            startMailAuthProcess();
          });
        };

        const step2 = async () => {
          console.log("Entering step 2: Clicking login button");
          await clickButton("input.loginbtn", currentTabId, step3);  //<a href="#loginTab02">ID/PW 로그인</a>
        };

        await step3();
      });

      return true;
    });
  } else if (message.action === "saveMailOption") {
    chrome.storage.local.set({mailOption: message.mailOption}, () => {
      console.log("Mail option saved:", message.mailOption);
      sendResponse({status: "success"});
    });
    return true;
  }
});

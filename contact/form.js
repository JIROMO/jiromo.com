(function () {
  var form = document.getElementById("contact-form");
  var submit = document.getElementById("submit");
  var hint = document.getElementById("submit-hint");
  var formError = document.getElementById("form-error");
  var done = document.getElementById("contact-done");
  var fields = ["category", "name", "company", "email", "phone", "message", "privacy"];
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_PATTERN = /^[0-9+()\-\s]+$/;
  var widgetId = null;
  var token = "";
  var submitting = false;

  /* 入力チェック */
  function validators() {
    var el = form.elements;
    var email = el.email.value.trim();
    var phone = el.phone.value.trim();
    return {
      category: el.category.value ? "" : "ご相談の種類を選択してください。",
      name: el.name.value.trim() ? "" : "お名前を入力してください。",
      company: "",
      email: !email
        ? "メールアドレスを入力してください。"
        : EMAIL_PATTERN.test(email)
          ? ""
          : "メールアドレスの形式をご確認ください。",
      phone: phone && !PHONE_PATTERN.test(phone) ? "電話番号の形式をご確認ください。" : "",
      message: el.message.value.trim() ? "" : "ご相談内容を入力してください。",
      privacy: el.privacy.checked ? "" : "プライバシーポリシーへの同意が必要です。",
    };
  }

  function isComplete() {
    var result = validators();
    return fields.every(function (name) {
      return !result[name];
    });
  }

  function updateSubmit() {
    var complete = isComplete();
    submit.disabled = submitting || !complete || !token;
    hint.textContent = submitting
      ? ""
      : !complete
        ? "必須項目をすべて入力すると送信できます。"
        : !token
          ? "送信前の確認を完了してください。"
          : "";
    hint.hidden = !hint.textContent;
  }

  function target(name) {
    return name === "category" ? pickerButton : form.elements[name];
  }

  function showError(name, message) {
    var error = document.getElementById(name + "-error");
    var input = target(name);
    error.textContent = message;
    error.hidden = !message;
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", name + "-error");
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function showErrors(errors) {
    var first = null;
    fields.forEach(function (name) {
      showError(name, errors[name] || "");
      if (errors[name] && !first) first = target(name);
    });
    if (first) first.focus();
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  /* プルオーバー */
  var picker = document.getElementById("category-picker");
  var pickerButton = document.getElementById("category-button");
  var pickerValue = document.getElementById("category-value");
  var pickerList = document.getElementById("category-list");
  var options = Array.prototype.slice.call(pickerList.querySelectorAll('[role="option"]'));
  var activeIndex = -1;

  function isOpen() {
    return !pickerList.hidden;
  }

  function setActive(index) {
    activeIndex = index;
    options.forEach(function (option, i) {
      option.classList.toggle("is-active", i === index);
    });
    if (index >= 0) {
      pickerButton.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else {
      pickerButton.removeAttribute("aria-activedescendant");
    }
  }

  function openPicker() {
    pickerList.hidden = false;
    pickerButton.setAttribute("aria-expanded", "true");
    var selected = options.findIndex(function (option) {
      return option.getAttribute("aria-selected") === "true";
    });
    setActive(selected >= 0 ? selected : 0);
  }

  function closePicker() {
    pickerList.hidden = true;
    pickerButton.setAttribute("aria-expanded", "false");
    setActive(-1);
  }

  function selectOption(index) {
    var option = options[index];
    options.forEach(function (item) {
      item.setAttribute("aria-selected", String(item === option));
    });
    form.elements.category.value = option.dataset.value;
    pickerValue.textContent = option.textContent;
    pickerValue.classList.remove("is-placeholder");
    closePicker();
    showError("category", "");
    updateSubmit();
  }

  pickerButton.addEventListener("click", function () {
    if (isOpen()) closePicker();
    else openPicker();
  });

  pickerButton.addEventListener("keydown", function (event) {
    var key = event.key;
    if (!isOpen()) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openPicker();
      }
      return;
    }
    if (key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, options.length - 1));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
    } else if (key === "Escape") {
      event.preventDefault();
      closePicker();
    } else if (key === "Tab") {
      closePicker();
    }
  });

  options.forEach(function (option, index) {
    option.addEventListener("mousemove", function () {
      if (activeIndex !== index) setActive(index);
    });
    // ボタンからフォーカスを外さずに選択する。
    option.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    option.addEventListener("click", function () {
      selectOption(index);
      pickerButton.focus();
    });
  });

  document.addEventListener("click", function (event) {
    if (isOpen() && !picker.contains(event.target)) closePicker();
  });

  pickerButton.addEventListener("blur", function () {
    if (isOpen()) return;
    showError("category", validators().category);
  });

  /* 入力の監視 */
  form.addEventListener("input", function (event) {
    var name = event.target.name;
    // 入力中はエラーを増やさず、直ったものだけ消す。
    if (fields.indexOf(name) >= 0 && !validators()[name]) showError(name, "");
    showFormError("");
    updateSubmit();
  });

  form.addEventListener("change", function (event) {
    if (event.target.name === "privacy") showError("privacy", validators().privacy);
    updateSubmit();
  });

  ["name", "email", "phone", "message"].forEach(function (name) {
    form.elements[name].addEventListener("blur", function () {
      showError(name, validators()[name]);
    });
  });

  /* Turnstile */
  function renderWidget() {
    if (widgetId !== null) return;
    widgetId = window.turnstile.render("#turnstile", {
      sitekey: form.dataset.sitekey,
      action: "contact",
      theme: "dark",
      language: "ja",
      callback: function (value) {
        token = value;
        showFormError("");
        updateSubmit();
      },
      "expired-callback": function () {
        token = "";
        updateSubmit();
      },
      "error-callback": function () {
        token = "";
        showFormError("確認を読み込めませんでした。ページを再読み込みしてください。");
        updateSubmit();
      },
    });
  }
  // コールバックを設定してから読み込むことで、読み込み順に左右されないようにする。
  window.onTurnstileLoad = renderWidget;
  var turnstileScript = document.createElement("script");
  turnstileScript.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  turnstileScript.async = true;
  turnstileScript.onerror = function () {
    showFormError("確認を読み込めませんでした。ページを再読み込みしてください。");
  };
  document.head.appendChild(turnstileScript);

  // トークンは1回限りなので、サーバーへ渡したあとは取り直す。
  function resetWidget() {
    token = "";
    if (widgetId !== null) window.turnstile.reset(widgetId);
  }

  /* 送信 */
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (submitting || !token || !isComplete()) return;
    showFormError("");
    submitting = true;
    submit.textContent = "送信中です";
    updateSubmit();

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.elements.category.value,
        name: form.elements.name.value,
        company: form.elements.company.value,
        email: form.elements.email.value,
        phone: form.elements.phone.value,
        message: form.elements.message.value,
        privacy: form.elements.privacy.checked,
        website: form.elements.website.value,
        token: token,
      }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.body.ok) {
          form.hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        if (result.status === 422) {
          // 入力エラーではトークンは未使用のまま。そのまま再送できる。
          showErrors(result.body.errors || {});
          return;
        }
        resetWidget();
        showFormError(
          result.body.error === "turnstile"
            ? "送信前の確認に失敗しました。もう一度お試しください。"
            : "送信できませんでした。時間をおいてもう一度お試しください。",
        );
      })
      .catch(function () {
        resetWidget();
        showFormError("送信できませんでした。通信環境をご確認ください。");
      })
      .finally(function () {
        submitting = false;
        submit.textContent = "送信する";
        updateSubmit();
      });
  });

  // 再読み込みでブラウザが入力を復元した場合にも状態を合わせる。
  updateSubmit();
})();

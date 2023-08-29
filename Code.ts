function doGet() {
  // testing 
   return HtmlService.createTemplateFromFile('uploadForm').evaluate();
}

// receive the file & bookid
function uploadFile(theForm) {
   var fileBlob = theForm.theFile;         // This is a Blob.
   var bookId = theForm.selectedBook;
  
    var fileName = fileBlob.getName();
    var fileExtension = getFileExtension(fileName);
    if (fileExtension === "ofx") {
        var fileContent = fileBlob.getDataAsString();
        if (fileContent.includes("<OFX>") && fileContent.includes("</OFX>")){
           var institutionInfo = extractInstitutionInfo(fileContent, fileName);
           var transactions = parseOFXFile(fileContent).transactions;
    
           processTransactions(transactions, bookId, institutionInfo);
           
           var message = fileName + "File parsed successfully.";
           return message;
        } else {
           return "The content does not match the ofx standard.";
        }
     } else {
         return "This does not seem to be an OFX file.";
     }
}

// check for ofx properties
function isOFXFile(file) {
  var fileExtension = getFileExtension(file.getName());
  if (fileExtension === "ofx") {
    var fileContent = file.getBlob().getDataAsString();
    return fileContent.includes("<OFX>") && fileContent.includes("</OFX>");
  }
  return false;
}





// get the transactions from the ofx file
function parseOFXFile(fileContent) {
  try {
  var pattern = /<STMTTRN>[\s\S]*?<\/STMTTRN>/g;
  var transactions = [];
  var i = 0
  
  var matches = fileContent.match(pattern);
  if (matches) {
    matches.forEach(function(match) {
      var trnType = extractTagValue(match, "TRNTYPE");
      var dtPosted = extractTagValue(match, "DTPOSTED");
      var trnAmt = extractTagValue(match, "TRNAMT");
      var fitId = extractTagValue(match, "FITID");
      var memo = extractTagValue(match, "MEMO");
      
      transactions.push({
        trnType: trnType,
        postdate: dtPosted,
        amount: trnAmt,
        id: fitId,
        description: memo
      });

    });
  }
  return {  transactions: transactions }
} catch (error) {
    throw error;
  }
}

function extractTagValue(text, tagName) {
  var pattern = new RegExp("<" + tagName + ">([^<]*)", "i");
  var match = text.match(pattern);
  return match ? match[1] : "";
}

// book the transactions in book
function processTransactions(transactions, bookId, institutionInfo) {
  try{
  var book = BkperApp.getBook(bookId);
  var datePattern = book.getDatePattern();
  var institutionName = institutionInfo.institutionName;

  for (var i = 0; i < transactions.length; i++) {
    var transaction = transactions[i];
    var trnType = transaction.trnType;
    var postdate = convertOFXDate(transaction.postdate); // Assuming you have "dtPosted" in your transactions array
    var amount = parseFloat(transaction.amount); // Assuming you have "trnAmt" in your transactions array
    var description = transaction.description;
    var formattedPostDate = Utilities.formatDate(postdate, Session.getScriptTimeZone(), datePattern);

    
    var tx = book.newTransaction()
    tx.setDate(formattedPostDate);
    tx.setAmount(amount);
    tx.setDescription( description + " " + trnType);
    
    var account = findMatchingAccount(book, institutionName)
    if (!account){ 
      tx.setDescription( description + " " +institutionName + " " + trnType);
      } else {
   if (account.isCredit()){
    // credit account 
      if (amount < 0) {     
         tx.setCreditAccount(account); // Credit account is the institution for negative amounts
      } else {
         tx.setDebitAccount(account); // Debit account is the institution for positive amounts
      }
    } else {
      // Debit account 
      if (amount < 0) {
         tx.setCreditAccount(account); // Credit account is the institution for negative amounts
         } else {
         tx.setDebitAccount(account); // Debit account is the institution for positive amounts
        }
      }
    }
    // Commit the transaction to the book
    tx.create();
   } 
  }
  catch (error) {
    throw error;
  }
}


function getBkperBooks() {
  var books = BkperApp.getBooks();
  var bookList = [];
  books.forEach(function(book) {
    bookList.push({ id: book.getId(), name: book.getName() });
  });
  return bookList;
}

/*
/
/  bellow is 100% AI (bard & open ai)
/
*/

// likelyhood of being an ofx file 
function isOFXFile(file) {
  var fileExtension = getFileExtension(file.getName());
  if (fileExtension === "ofx") {
    var fileContent = file.getBlob().getDataAsString();
    return fileContent.includes("<OFX>") && fileContent.includes("</OFX>");
  }
  return false;
}

function getFileExtension(filename) {
  return filename.split('.').pop();
}

// Regular date stuff 
function convertOFXDate(ofxDate) {
  // Split the OFX date into date and timezone parts
  var parts = ofxDate.split("[");
  var datePart = parts[0];
  
  // Extract year, month, and day from the date part
  var year = parseInt(datePart.substr(0, 4));
  var month = parseInt(datePart.substr(4, 2));
  var day = parseInt(datePart.substr(6, 2));
  
  // Construct a JavaScript date object
  var jsDate = new Date(year, month - 1, day);
  
  // Adjust for timezone (e.g., -3 hours for [-3:GMT])
  if (parts[1]) {
    var timezoneOffset = parseInt(parts[1]);
    jsDate.setHours(jsDate.getHours() + timezoneOffset);
  }
  
  return jsDate;
}


// figure out the institution where the ofx comes from
function extractInstitutionInfo(fileContent, fileName) {
  var institutionInfo = {};
  
  // Extract institution name from <ORG> tag
  var orgMatch = fileContent.match(/<ORG>([^<]*)/);
  if (orgMatch && orgMatch[1]) {
    institutionInfo.institutionName = orgMatch[1].trim();
  } else {
    // Use the bank name from the filename
    institutionInfo.institutionName = getBankNameFromFileName(fileName);
  }
  
  // You can extract other relevant information similarly if needed
  
  return institutionInfo;
}


function getBankNameFromFileName(fileName) {
  // Extract the bank name from the filename
  var match = fileName.match(/^(.*?)\-\d{4}\-\d{2}\.\w+$/);
  return match ? match[1] : "";
}

// try to find the account on Bkper that is likely to be the same as the institution that generated the ofx file. 
// 
function findMatchingAccount(book, partialAccountName) {
  var accounts = book.getAccounts();
  var matchingAccount = null;
  var maxMatch = 0;

  for (var i = 0; i < accounts.length; i++) {
    var account = accounts[i];
    var accountName = account.getName();
    var matchValue = similarity(accountName.toLowerCase(), partialAccountName.toLowerCase());
    
    if (matchValue > maxMatch) {
      maxMatch = matchValue;
      matchingAccount = account;
    }
  }

  return matchingAccount;
}

// Function to calculate similarity between two strings
function similarity(s1, s2) {
  var longer = s1;
  var shorter = s2;
  
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }

  var longerLength = longer.length;

  if (longerLength == 0) {
    return 1.0;
  }

  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

// Function to calculate edit distance between two strings
function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }

  return costs[s2.length];
}



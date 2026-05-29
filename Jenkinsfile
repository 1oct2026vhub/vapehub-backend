def branchName = env.BRANCH_NAME

pipeline {
    agent any

    parameters {
        string(name: 'dev_server', defaultValue: '13.61.169.67', description: 'Development Server')
        string(name: 'prod_server', defaultValue: '13.48.155.56', description: 'Production Server')

    }

    stages {
        stage('SonarQube Analysis') {
           steps {
               script {
                   def scannerHome = tool 'AteamSonarTool';
                   withSonarQubeEnv() {
                       sh "${scannerHome}/bin/sonar-scanner"
                   }
               }
           }            
        }

        stage('Deploy') {
            steps {                
                script {
                      // Check the current branch name
                    def server
                    def sshCredentials

                    if (branchName == 'staging-v3') {
                        // Use deployment parameters
                        server = params.dev_server
                        sshCredentials = '5918cce5-91ae-41e6-aa94-bf269093dee1'
                    } else if (branchName == 'main') {
                        // Use production parameters                       
                        server = params.prod_server
                        sshCredentials = '11b5722d-376f-47da-b28a-2b3ebc72e5ff'
                    } else {
                        // Handle other branches if needed
                        echo "Branch $branchName not configured for deployment."
                        return
                    }

                    // Use SSH credentials with sshagent
                    sshagent([sshCredentials]) {
                        // SSH into the server and run commands
                        sh "ssh ubuntu@${server} \"cd /var/www/vapehub/backend/ && git pull\""
                        sh "ssh ubuntu@${server} \"cd /var/www/vapehub/backend/ && npm install \""
                        sh "ssh ubuntu@${server} \"cd /var/www/vapehub/backend/ && npm run migrate \""
                        sh "ssh ubuntu@${server} \"pm2 restart 'Backend' \"" 
                    }
}
            }
        }       
    }
    post {
        always {
            emailext (
                subject: "Jenkins Build ${currentBuild.result}",
                body: """<p>The Jenkins build for ${env.JOB_NAME} has finished.</p>
                        <p>Build result: ${currentBuild.result}</p>""",
                to: "mahesh@ateamsoftsolutions.com, deepu@ateamsoftsolutions.com, tophia@ateamsoftsolutions.com",
                attachLog: true,
                compressLog: true,
                replyTo: 'noreply@example.com'
            )
        }        
    }

}

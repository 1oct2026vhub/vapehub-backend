def branchName = env.BRANCH_NAME

pipeline {
    agent any

    stages {
        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'VapehubSonarTool'
                    withSonarQubeEnv('VapehubSonar') {
                        sh "${scannerHome}/bin/sonar-scanner"
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    if (branchName != 'staging-v-1') {
                        echo "Branch ${branchName} not configured for deployment."
                        return
                    }
                    sshagent(['vapehub-localhost-ssh']) {
                        sh "ssh -o StrictHostKeyChecking=no ubuntu@localhost \"cd /var/www/vapehub/backend/ && git pull\""
                        sh "ssh -o StrictHostKeyChecking=no ubuntu@localhost \"cd /var/www/vapehub/backend/ && npm install\""
                        sh "ssh -o StrictHostKeyChecking=no ubuntu@localhost \"cd /var/www/vapehub/backend/ && npm run migrate\""
                        sh "ssh -o StrictHostKeyChecking=no ubuntu@localhost \"pm2 restart 'Backend'\""
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
                attachLog: true, compressLog: true, replyTo: 'noreply@example.com'
            )
        }
    }
}